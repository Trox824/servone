import type { AccountUuid, Ref } from '@hcengineering/core'
import { MarkupMarkType, MarkupNodeType, traverseAllMarks, traverseNode, type MarkupNode } from '@hcengineering/text-core'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import { MAIL_MESSAGE_CLASS, mailboxSpaceId, type MailMessageCard, type MailThreadCard } from '@servone/mail'
import { fakeSession } from '../../mcp/__tests__/fixtures'
import { createTaskForCaller, mailTaskLink, parseTaskRequest, quoteForTask, type TaskRequest } from '../task'

describe('Tạo việc', () => {
  it('needs message, project and a non-blank title', () => {
    expect(parseTaskRequest({ message: 'm', project: 'SRV', title: ' Báo giá ' })).toEqual({ message: 'm', project: 'SRV', title: 'Báo giá' })
    expect(parseTaskRequest({ message: 'm', project: 'SRV', title: '  ' })).toEqual({ error: 'invalid_task' })
    expect(parseTaskRequest({ project: 'SRV', title: 'x' })).toEqual({ error: 'invalid_task' })
  })

  it('truncates a title past the tracker limit instead of rejecting it', () => {
    const longTitle = 'x'.repeat(300)
    expect(parseTaskRequest({ message: 'm', project: 'SRV', title: longTitle })).toEqual({ message: 'm', project: 'SRV', title: 'x'.repeat(255) })
  })

  it('quotes sender, date, subject and snippet and links back to the mail', () => {
    const markdown = quoteForTask(
      { mailFrom: 'An <an@acme.vn>', mailSentAt: Date.UTC(2026, 8, 27, 3, 0), title: 'Báo giá tháng 10', mailSnippet: 'Chào anh,\ngửi báo giá' },
      'https://platform.servone.app/workbench/acme/mail/m-1'
    )
    expect(markdown).toBe([
      '> **Từ:** An \\<an@acme\\.vn\\>',
      '> **Ngày:** 2026-09-27 10:00',
      '> **Chủ đề:** Báo giá tháng 10',
      '>',
      '> Chào anh,',
      '> gửi báo giá',
      '',
      '[Mở thư](https://platform.servone.app/workbench/acme/mail/m-1)'
    ].join('\n'))
  })
})

// Regression coverage for the round-2 review finding: mailFrom/title/mailSnippet are attacker-controlled
// (From, Subject, body of an arbitrary email), so the quote must survive the real markdown parser inert.
describe('quoteForTask neutralizes markdown in email fields', () => {
  const LINK = 'https://platform.servone.app/workbench/acme/mail/m-1'
  const base = { mailFrom: 'a@b.c', mailSentAt: 0, title: 'Subject' }

  function linkHrefs (root: MarkupNode): string[] {
    const hrefs: string[] = []
    traverseAllMarks(root, (_node, mark) => {
      if (mark.type === MarkupMarkType.link) hrefs.push(String(mark.attrs?.href ?? ''))
    })
    return hrefs
  }

  function imageCount (root: MarkupNode): number {
    let count = 0
    traverseNode(root, (node) => {
      if (node.type === MarkupNodeType.image) count += 1
      return true
    })
    return count
  }

  it.each([
    ['a fake markdown link', '[click](javascript:alert(1))'],
    ['a raw HTML anchor', '<a href="javascript:alert(1)">click</a>'],
    ['a fake markdown image', '![x](http://tracker)'],
    ['an autolink', '<http://evil>']
  ])('keeps %s in the snippet from producing a link or image', (_name, payload) => {
    const root = markdownToMarkup(quoteForTask({ ...base, mailSnippet: payload }, LINK))
    expect(linkHrefs(root)).toEqual([LINK])
    expect(imageCount(root)).toBe(0)
  })

  it('still renders exactly one real link, to the mail, even with malicious sender/subject/body', () => {
    const root = markdownToMarkup(
      quoteForTask(
        {
          mailFrom: '[click](javascript:alert(1))',
          mailSentAt: 0,
          title: '![x](http://tracker)',
          mailSnippet: '<a href="javascript:alert(1)">click</a>\n<http://evil>'
        },
        LINK
      )
    )
    expect(linkHrefs(root)).toEqual([LINK])
    expect(imageCount(root)).toBe(0)
  })
})

describe('mailTaskLink', () => {
  const THREAD = 't-1' as Ref<MailThreadCard>

  it('links to the thread under the caller\'s workspace', () => {
    expect(mailTaskLink('https://platform.servone.app', 'acme', THREAD)).toBe('https://platform.servone.app/workbench/acme/mail/t-1')
  })

  it('falls back to the workbench root when the workspace url cannot be resolved', () => {
    expect(mailTaskLink('https://platform.servone.app', undefined, THREAD)).toBe('https://platform.servone.app/workbench')
  })
})

describe('createTaskForCaller', () => {
  const OWNER = 'acc-owner' as AccountUuid
  const OTHER = 'acc-other' as AccountUuid
  const MESSAGE = 'm-1' as Ref<MailMessageCard>
  const REQUEST: TaskRequest = { message: MESSAGE, project: 'SRV', title: 'x' }

  it('answers not_found and creates no issue for a message in another mailbox', async () => {
    const session = fakeSession()
    // Only the owner's mailbox space holds this message; any other caller's query simply finds nothing.
    const findOne = jest.fn(async (_cls: unknown, query: { _id: Ref<MailMessageCard>, space: string }) =>
      query._id === MESSAGE && query.space === mailboxSpaceId(OWNER) ? { _id: MESSAGE, space: mailboxSpaceId(OWNER) } : undefined
    )
    const addCollection = jest.fn()
    session.client.findOne = findOne
    session.client.addCollection = addCollection

    const result = await createTaskForCaller(session, { account: OTHER }, 'acme', 'https://platform.servone.app', REQUEST)

    expect(result).toEqual({ error: 'not_found' })
    expect(findOne).toHaveBeenCalledWith(MAIL_MESSAGE_CLASS, { _id: MESSAGE, space: mailboxSpaceId(OTHER) })
    expect(addCollection).not.toHaveBeenCalled()
  })

  it('answers invalid_message and creates no issue for a draft', async () => {
    const session = fakeSession()
    const addCollection = jest.fn()
    session.client.findOne = jest.fn(async () => ({ _id: MESSAGE, space: mailboxSpaceId(OWNER), mailIsDraft: true }))
    session.client.addCollection = addCollection

    const result = await createTaskForCaller(session, { account: OWNER }, 'acme', 'https://platform.servone.app', REQUEST)

    expect(result).toEqual({ error: 'invalid_message' })
    expect(addCollection).not.toHaveBeenCalled()
  })
})
