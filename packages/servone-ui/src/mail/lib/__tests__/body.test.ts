import type { MasterTag } from '@hcengineering/card'
import type { PersonId, Ref, Space } from '@hcengineering/core'
import type { MailFolderCard, MailMessageCard, MailThreadCard } from '@servone/mail'
import { BodyFetchError, bodyCache, bodyStateOf, cacheBody, draftMessages, initiallyExpanded, latestNonDraftMessage, loadBody, readBodyResponse, nonDraftMessages } from '../body'

const MESSAGE_CLASS = 'servone:type:MailMessage' as Ref<MasterTag>

function message (id: string, folders: string[], overrides: Partial<MailMessageCard> = {}): MailMessageCard {
  return {
    _id: id as Ref<MailMessageCard>,
    _class: MESSAGE_CLASS,
    space: 'space1' as Ref<Space>,
    modifiedOn: 0,
    modifiedBy: 'user1' as PersonId,
    title: id,
    content: 'content1' as MailMessageCard['content'],
    blobs: {},
    parentInfo: [],
    rank: '0',
    mailThread: 'thread1' as Ref<MailThreadCard>,
    mailMessageId: `<${id}@x>`,
    mailInReplyTo: '',
    mailReferences: [],
    mailFrom: 'a@x.vn',
    mailTo: [],
    mailCc: [],
    mailBcc: [],
    mailSentAt: 0,
    mailSnippet: '',
    mailIsRead: true,
    mailIsStarred: false,
    mailIsDraft: false,
    mailLocations: [],
    mailFolders: folders as Array<Ref<MailFolderCard>>,
    mailProviderMessageId: `provider-${id}`,
    mailBodyBlob: '',
    mailRawBlob: '',
    mailHasAttachments: false,
    mailTargetFolder: null,
    mailIsDeleted: false,
    ...overrides
  }
}

function bodyMessage (override: Partial<MailMessageCard> & Pick<MailMessageCard, '_id'>): Pick<MailMessageCard, '_id' | 'mailBodyBlob' | 'mailRawBlob'> {
  return { mailBodyBlob: '', mailRawBlob: '', ...override }
}

it('reports pending/blob/raw from the card alone', () => {
  expect(bodyStateOf({ mailBodyBlob: '', mailRawBlob: '' })).toBe('pending')
  expect(bodyStateOf({ mailBodyBlob: 'b1', mailRawBlob: '' })).toBe('blob')
  expect(bodyStateOf({ mailBodyBlob: '', mailRawBlob: 'r1' })).toBe('raw')
})

it('asks the backend for a body that was never fetched', async () => {
  const fetchNow = jest.fn(async () => {})
  expect(await loadBody(bodyMessage({ _id: 'm1' as Ref<MailMessageCard> }), async () => '', fetchNow)).toEqual({ kind: 'pending' })
  expect(fetchNow).toHaveBeenCalledWith('m1')
})

it('falls back to the raw message when parsing failed', async () => {
  expect(
    await loadBody(bodyMessage({ _id: 'm1' as Ref<MailMessageCard>, mailRawBlob: 'r1' }), async () => '', async () => {})
  ).toEqual({ kind: 'raw', rawBlob: 'r1' })
})

it('fetches and returns the prepared html for a fetched blob', async () => {
  expect(
    await loadBody(bodyMessage({ _id: 'm1' as Ref<MailMessageCard>, mailBodyBlob: 'b1' }), async () => '<p>hi</p>', async () => {})
  ).toEqual({ kind: 'html', html: '<p>hi</p>' })
})

it('treats an empty fetched body as empty', async () => {
  expect(
    await loadBody(bodyMessage({ _id: 'm1' as Ref<MailMessageCard>, mailBodyBlob: 'b1' }), async () => '', async () => {})
  ).toEqual({ kind: 'empty' })
})

it('expands the first unread message, else the last', () => {
  const read = message('m1', ['inbox'], { mailIsRead: true, mailSentAt: 1 })
  const unread = message('m2', ['inbox'], { mailIsRead: false, mailSentAt: 2 })
  const last = message('m3', ['inbox'], { mailIsRead: false, mailSentAt: 3 })
  expect([...initiallyExpanded([read, unread, last])]).toEqual(['m2'])
  expect([...initiallyExpanded([read])]).toEqual(['m1'])
})

it('rejects an error response instead of reading it as the body', async () => {
  const response = (status: number, body: string): Pick<Response, 'ok' | 'status' | 'text'> => ({ ok: status < 400, status, text: async () => body })
  await expect(readBodyResponse(response(404, '<html>Not found</html>'))).rejects.toBeInstanceOf(BodyFetchError)
  expect(await readBodyResponse(response(200, '<p>hi</p>'))).toBe('<p>hi</p>')
})

it('shows the raw download when the body fetch fails, and a failure without one', async () => {
  const failing = async (): Promise<string> => { throw new BodyFetchError(500) }
  expect(
    await loadBody(bodyMessage({ _id: 'm1' as Ref<MailMessageCard>, mailBodyBlob: 'b1', mailRawBlob: 'r1' }), failing, async () => {})
  ).toEqual({ kind: 'raw', rawBlob: 'r1' })
  expect(
    await loadBody(bodyMessage({ _id: 'm1' as Ref<MailMessageCard>, mailBodyBlob: 'b1' }), failing, async () => {})
  ).toEqual({ kind: 'failed' })
})

it('lets an unexpected fetch error through', async () => {
  const failing = async (): Promise<string> => { throw new TypeError('network') }
  await expect(loadBody(bodyMessage({ _id: 'm1' as Ref<MailMessageCard>, mailBodyBlob: 'b1' }), failing, async () => {})).rejects.toBeInstanceOf(TypeError)
})

it('keeps a reply draft out of the latest message', () => {
  const first = message('m1', ['inbox'], { mailSentAt: 1 })
  const second = message('m2', ['inbox'], { mailSentAt: 2 })
  const draft = message('d1', ['drafts'], { mailSentAt: 3, mailIsDraft: true })
  expect(latestNonDraftMessage([first, draft, second])?._id).toBe('m2')
  expect(latestNonDraftMessage([draft])).toBeUndefined()
  expect(nonDraftMessages([first, draft, second]).map((it) => it._id)).toEqual(['m1', 'm2'])
  expect(draftMessages([first, draft, second]).map((it) => it._id)).toEqual(['d1'])
})

it('drops a discarded draft before the backend removes its card', () => {
  const draft = message('d1', ['drafts'], { mailIsDraft: true })
  const discardedDraft = message('d2', ['drafts'], { mailIsDraft: true, mailIsDeleted: true })
  expect(draftMessages([draft, discardedDraft]).map((it) => it._id)).toEqual(['d1'])
})

it('drops a deleted message from the non-draft list', () => {
  const kept = message('m1', ['inbox'])
  const deleted = message('m2', ['inbox'], { mailIsDeleted: true })
  expect(nonDraftMessages([kept, deleted]).map((it) => it._id)).toEqual(['m1'])
})

it('evicts the oldest cached body past the cap and keeps a rewritten one', () => {
  const id = (n: number): Ref<MailMessageCard> => `m${n}` as Ref<MailMessageCard>
  for (let n = 0; n < 50; n++) cacheBody(id(n), `<p>${n}</p>`)
  cacheBody(id(0), '<p>0 again</p>')
  cacheBody(id(50), '<p>50</p>')
  expect(bodyCache.size).toBe(50)
  expect(bodyCache.has(id(1))).toBe(false)
  expect(bodyCache.get(id(0))).toBe('<p>0 again</p>')
})
