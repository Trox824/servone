import { markupToJSON, MarkupNodeType } from '@hcengineering/text-core'
import { taskDescription, taskTitle } from '../task'

const labels = { from: 'From', date: 'Date', subject: 'Subject', openMail: 'Open email' }

describe('taskTitle', () => {
  it('drops reply prefixes and collapses whitespace', () => {
    expect(taskTitle('Re: Fwd:  Báo giá\n gói')).toBe('Báo giá gói')
  })
})

describe('taskDescription', () => {
  const message = { mailFrom: 'An <an@x.vn>', mailSentAt: Date.UTC(2026, 8, 27, 8, 0), title: 'Báo giá', mailSnippet: 'Dòng 1\n\n[link](http://evil)' }

  it('quotes sender, subject and body as plain text, then links the thread', () => {
    const doc = markupToJSON(taskDescription(message, 'https://app/workbench/ws/mail/t1', labels, 'en'))
    const [quote, linkParagraph] = doc.content ?? []
    expect(quote.type).toBe(MarkupNodeType.blockquote)
    const lines = (quote.content ?? []).map((paragraph) => (paragraph.content ?? []).map((node) => node.text).join(''))
    expect(lines[0]).toBe('From: An <an@x.vn>')
    expect(lines[2]).toBe('Subject: Báo giá')
    expect(lines.slice(3)).toEqual(['Dòng 1', '[link](http://evil)'])
    expect(linkParagraph.content?.[0].marks?.[0].attrs?.href).toBe('https://app/workbench/ws/mail/t1')
  })

  it('omits empty fields instead of emitting empty text nodes', () => {
    const doc = markupToJSON(taskDescription({ ...message, title: '', mailSnippet: '' }, 'https://app', labels, 'en'))
    expect(doc.content?.[0].content).toHaveLength(2)
  })
})
