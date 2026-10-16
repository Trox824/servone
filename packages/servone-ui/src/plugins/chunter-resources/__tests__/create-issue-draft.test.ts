import { messageToDraft, type DraftSource } from '../create-issue/draft'

interface Node {
  type: string
  text?: string
  attrs?: Record<string, string | number>
  marks?: Node[]
  content?: Node[]
}

const text = (t: string, marks?: Node[]): Node => (marks === undefined ? { type: 'text', text: t } : { type: 'text', text: t, marks })
const bold: Node = { type: 'bold' }
const link = (href: string): Node => ({ type: 'link', attrs: { href } })
const para = (...content: Node[]): Node => ({ type: 'paragraph', content })
const heading = (t: string): Node => ({ type: 'heading', attrs: { level: 3 }, content: [text(t)] })
const doc = (...content: Node[]): string => JSON.stringify({ type: 'doc', content })

const LINK = 'https://app.example.com/workbench/w/chunter/c1?message=m1'
const BASE: DraftSource = {
  markup: doc(),
  isWebhook: false,
  origin: { kind: 'channel', name: 'ops' },
  author: 'Lan',
  sentAt: 'Sep 27, 2026, 10:04 AM',
  link: LINK
}

function draftOf (markup: string, extra: Partial<DraftSource> = {}): { title: string, content: Node[] } {
  const draft = messageToDraft({ ...BASE, ...extra, markup })
  const description: { content: Node[] } = JSON.parse(draft.description)
  return { title: draft.title, content: description.content }
}

const originLine = (where: string): Node =>
  para(text(`From ${where} · Lan · Sep 27, 2026, 10:04 AM · `), text('Open message', [link(LINK)]))

describe('messageToDraft title', () => {
  it('uses the first heading even when a paragraph comes first', () => {
    const { title } = draftOf(doc(para(text('intro')), heading('Deploy failed on api'), para(text('details'))))
    expect(title).toBe('Deploy failed on api')
  })

  it('uses the first non-empty line when there is no heading', () => {
    const markup = doc(para(), para(text('  Checkout   is broken '), { type: 'hardBreak' }, text('since 9am')))
    expect(draftOf(markup).title).toBe('Checkout is broken')
  })

  it('cuts a long title on a word boundary', () => {
    const words = Array(30).fill('word').join(' ')
    const { title } = draftOf(doc(para(text(words))))
    expect(title).toBe(`${Array(19).fill('word').join(' ')}...`)
    expect(title.length).toBeLessThanOrEqual(100)
  })

  it('keeps a title of exactly 100 characters', () => {
    expect(draftOf(doc(para(text('a'.repeat(100))))).title).toBe('a'.repeat(100))
  })

  it('hard-cuts a long line with no spaces', () => {
    expect(draftOf(doc(para(text('x'.repeat(150))))).title).toBe(`${'x'.repeat(97)}...`)
  })

  it('names the author for a message with only files', () => {
    expect(draftOf(doc()).title).toBe('Message from Lan')
  })

  it('takes the title from a code block when that is all the text', () => {
    const markup = doc({ type: 'codeBlock', attrs: { language: '' }, content: [text('\nError: boom\n  at main')] })
    expect(draftOf(markup).title).toBe('Error: boom')
  })

  it('strips tags from a legacy HTML message', () => {
    expect(draftOf('<p>Server <b>down</b></p>').title).toBe('Server down')
  })

  it('takes only the first paragraph of a legacy HTML message and decodes entities', () => {
    expect(draftOf('<p>Q&amp;A&nbsp;is down</p><p>since 9am</p>').title).toBe('Q&A is down')
    expect(draftOf('<p>first<br>second</p>').title).toBe('first')
  })

  it('flattens mentions in the title', () => {
    const mention: Node = { type: 'reference', attrs: { id: 'p1', objectclass: 'contact:class:Person', label: 'Minh' } }
    expect(draftOf(doc(para(text('ping '), mention, text(' about login')))).title).toBe('ping @Minh about login')
  })
})

describe('messageToDraft description', () => {
  it('quotes the message and adds the origin line', () => {
    const { content } = draftOf(doc(para(text('hello'))))
    expect(content).toEqual([{ type: 'blockquote', content: [para(text('hello'))] }, originLine('#ops')])
  })

  it('names the conversation without # in a direct message', () => {
    const { content } = draftOf(doc(para(text('hi'))), { origin: { kind: 'direct', name: 'Lan, Minh' } })
    expect(content[1]).toEqual(originLine('Lan, Minh'))
  })

  it('has only the origin line for a message with only files', () => {
    expect(draftOf(doc()).content).toEqual([originLine('#ops')])
  })

  it('flattens mentions in the quote', () => {
    const mention: Node = { type: 'reference', attrs: { id: 'p1', objectclass: 'contact:class:Person', label: 'Minh' } }
    const { content } = draftOf(doc(para(text('ping '), mention)))
    expect(content[0]).toEqual({ type: 'blockquote', content: [para(text('ping @Minh'))] })
  })

  it('keeps code blocks, lists and links as they are', () => {
    const code: Node = { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1')] }
    const list: Node = { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('one'))] }] }
    const linked = para(text('docs', [link('https://example.com')]))
    const { content } = draftOf(doc(para(text('Stack trace:')), code, list, linked))
    expect(content[0]).toEqual({ type: 'blockquote', content: [para(text('Stack trace:')), code, list, linked] })
  })

  it('turns webhook fields into a bullet list and keeps buttons as links', () => {
    const branch = para(text('Branch:', [bold]), text(' main'))
    const commit = para(text('Commit:', [bold]), text(' abc123'))
    const button = para(text('View build', [link('https://ci.example.com/42')]))
    const markup = doc(heading('Build #42 failed'), branch, commit, button)
    const { title, content } = draftOf(markup, { isWebhook: true })
    expect(title).toBe('Build #42 failed')
    expect(content[0]).toEqual({
      type: 'blockquote',
      content: [
        heading('Build #42 failed'),
        { type: 'bulletList', content: [{ type: 'listItem', content: [branch] }, { type: 'listItem', content: [commit] }] },
        button
      ]
    })
  })

  it('leaves bold labels alone in a message typed by a person', () => {
    const branch = para(text('Branch:', [bold]), text(' main'))
    const { content } = draftOf(doc(branch))
    expect(content[0]).toEqual({ type: 'blockquote', content: [branch] })
  })
})
