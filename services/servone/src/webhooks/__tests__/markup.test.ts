import { markupToJSON, type MarkupNode, MarkupNodeType } from '@hcengineering/text-core'
import contact from '@hcengineering/contact'
import type { Class, Doc, Ref } from '@hcengineering/core'
import type { Employee } from '@hcengineering/contact'
import { renderPayload, sanitizeMarkdown } from '../markup'
import { type MentionLookup, mentionTokens, NO_MENTIONS, type ResolvedMention } from '../mentions'

function allNodes (nodes: MarkupNode[]): MarkupNode[] {
  return nodes.flatMap((node) => [node, ...allNodes(node.content ?? [])])
}

function texts (nodes: MarkupNode[]): string {
  return allNodes(nodes)
    .map((node) => node.text ?? '')
    .join('')
}

function linkHrefs (nodes: MarkupNode[]): string[] {
  return allNodes(nodes).flatMap((node) =>
    (node.marks ?? []).filter((mark) => mark.type === 'link').map((mark) => String(mark.attrs?.href))
  )
}

describe('markdown sanitising', () => {
  it('keeps basic formatting', () => {
    const nodes = sanitizeMarkdown('# Title\n\n**bold** _it_ ~~gone~~ `code`\n\n- one\n- two\n\n1. first\n\n> quote\n\n---\n\n```js\nx()\n```')
    const types = new Set(allNodes(nodes).map((node) => node.type))
    for (const type of [
      MarkupNodeType.heading,
      MarkupNodeType.paragraph,
      MarkupNodeType.bullet_list,
      MarkupNodeType.ordered_list,
      MarkupNodeType.list_item,
      MarkupNodeType.blockquote,
      MarkupNodeType.horizontal_rule,
      MarkupNodeType.code_block
    ]) {
      expect(types.has(type)).toBe(true)
    }
    const markTypes = new Set(allNodes(nodes).flatMap((node) => (node.marks ?? []).map((mark) => mark.type)))
    expect([...markTypes].sort()).toEqual(['bold', 'code', 'italic', 'strike'])
  })

  it('keeps only http, https and mailto links', () => {
    const nodes = sanitizeMarkdown(
      '[a](https://ok.example) [b](http://ok.example) [c](mailto:a@b.co) [d](javascript:alert(1)) [e](data:text/html,x)'
    )
    expect(linkHrefs(nodes)).toEqual(['https://ok.example/', 'http://ok.example/', 'mailto:a@b.co'])
    expect(texts(nodes)).toContain('d')
  })

  it('shows raw HTML as text', () => {
    const nodes = sanitizeMarkdown('<img src=x onerror=alert(1)> <b>hi</b>\n\n<div>block</div>\n\n<!-- note -->')
    const text = texts(nodes)
    expect(text).toContain('<img src=x onerror=alert(1)>')
    expect(text).toContain('<div>block</div>')
    expect(text).toContain('<!-- note -->')
    expect(allNodes(nodes).some((node) => node.type === MarkupNodeType.image)).toBe(false)
  })

  it('turns images into links', () => {
    const nodes = sanitizeMarkdown('![chart](https://img.example/c.png) ![x](javascript:alert(1))')
    expect(allNodes(nodes).some((node) => node.type === MarkupNodeType.image)).toBe(false)
    expect(linkHrefs(nodes)).toEqual(['https://img.example/c.png'])
    expect(texts(nodes)).toContain('chart')
  })

  it('turns references into plain text', () => {
    const nodes = sanitizeMarkdown('[Ann](ref://?_class=contact%3Aclass%3APerson&_id=abc&label=Ann) hi')
    expect(allNodes(nodes).some((node) => node.type === MarkupNodeType.reference)).toBe(false)
    expect(texts(nodes)).toContain('Ann')
  })

  it('flattens tables and task lists into allowed nodes', () => {
    const nodes = sanitizeMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\n- [ ] todo')
    const allowed = new Set<string>([
      MarkupNodeType.paragraph,
      MarkupNodeType.text,
      MarkupNodeType.bullet_list,
      MarkupNodeType.list_item
    ])
    expect(allNodes(nodes).every((node) => allowed.has(node.type))).toBe(true)
    expect(texts(nodes)).toContain('todo')
  })
})

describe('payload rendering', () => {
  it('appends blocks after the text', () => {
    const markup = renderPayload({
      text: 'Deploy done',
      blocks: [
        { type: 'heading', text: 'Build 42' },
        { type: 'fields', fields: [{ label: 'Branch', value: '**develop**' }] },
        { type: 'button', text: 'Open', url: 'https://ci.example.com/42' }
      ]
    }, NO_MENTIONS)
    expect(markup).toBeDefined()
    const doc = markupToJSON(markup ?? '')
    const [text, heading, field, button] = doc.content ?? []
    expect(texts([text])).toBe('Deploy done')
    expect(heading).toMatchObject({ type: MarkupNodeType.heading, attrs: { level: 3 } })
    expect(field.content?.[0]).toMatchObject({ text: 'Branch:', marks: [{ type: 'bold' }] })
    // Field values are literal text, never parsed as markdown.
    expect(field.content?.[1]).toMatchObject({ text: ' **develop**' })
    expect(linkHrefs([button])).toEqual(['https://ci.example.com/42'])
  })

  it('reports text that sanitises to nothing', () => {
    expect(renderPayload({ text: '<!-- -->', blocks: [] }, NO_MENTIONS)).toBeDefined()
    expect(renderPayload({ text: '![](ftp://files.example/x.png)', blocks: [] }, NO_MENTIONS)).toBeUndefined()
  })
})

function references (markup: string | undefined): MarkupNode[] {
  return allNodes(markupToJSON(markup ?? '').content ?? []).filter((node) => node.type === MarkupNodeType.reference)
}

const ana: ResolvedMention = {
  id: 'person-ana' as Ref<Doc>,
  objectclass: contact.class.Person as Ref<Class<Doc>>,
  label: 'Ana',
  teamMembers: []
}
const backend: ResolvedMention = {
  id: 'dept-backend' as Ref<Doc>,
  objectclass: 'hr:class:Department' as Ref<Class<Doc>>,
  label: 'backend',
  teamMembers: ['p1' as Ref<Employee>, 'p2' as Ref<Employee>]
}

describe('mentions', () => {
  it('finds each token once', () => {
    expect(mentionTokens('<@ana@x.com> hi <@ana@x.com> <!here> <!subteam^backend> <!nope> <@noemail>')).toEqual([
      '<@ana@x.com>',
      '<!here>',
      '<!subteam^backend>'
    ])
  })

  it('shows tokens as text when mentions are off', () => {
    const markup = renderPayload({ text: 'ping <@ana@x.com> and <!here> and <!subteam^backend>', blocks: [] }, NO_MENTIONS)
    expect(references(markup)).toEqual([])
    expect(texts(markupToJSON(markup ?? '').content ?? [])).toBe('ping ana@x.com and @here and @backend')
  })

  it('turns resolved tokens into references, with hidden team members', () => {
    const lookup: MentionLookup = new Map([
      ['<@ana@x.com>', ana],
      ['<!subteam^backend>', backend]
    ])
    const markup = renderPayload({ text: '**Deploy** failed <@ana@x.com> <!subteam^backend> <@bob@x.com>', blocks: [] }, lookup)
    expect(references(markup).map((node) => node.attrs)).toEqual([
      { id: 'person-ana', objectclass: contact.class.Person, label: 'Ana' },
      { id: 'dept-backend', objectclass: 'hr:class:Department', label: 'backend' },
      { id: 'p1', objectclass: contact.class.Person, label: '', servoneTeam: 'dept-backend' },
      { id: 'p2', objectclass: contact.class.Person, label: '', servoneTeam: 'dept-backend' }
    ])
    expect(texts(markupToJSON(markup ?? '').content ?? [])).toContain('bob@x.com')
  })

  it('never lets senders forge a mention with sentinel characters', () => {
    const lookup: MentionLookup = new Map([['<@ana@x.com>', ana]])
    const markup = renderPayload({ text: 'fake \uE0000\uE001 real <@ana@x.com>', blocks: [] }, lookup)
    expect(references(markup)).toHaveLength(1)
    expect(texts(markupToJSON(markup ?? '').content ?? [])).toContain('fake \uE0000\uE001 real')
  })

  it('never lets senders forge a mention with entity-encoded markers', () => {
    const lookup: MentionLookup = new Map([['<!subteam^backend>', backend]])
    const markup = renderPayload({ text: '&#xE000;0&#xE001; &#57344;0&#57345; <!subteam^backend>', blocks: [] }, lookup)
    expect(references(markup).filter((node) => node.attrs?.servoneTeam === undefined)).toHaveLength(1)
    expect(references(markup)).toHaveLength(1 + backend.teamMembers.length)
  })

  it('keeps mention tokens inside code as literal text', () => {
    const lookup: MentionLookup = new Map([['<!here>', { ...ana, id: 'here' as Ref<Doc>, label: 'here' }]])
    const markup = renderPayload({ text: 'run `ping <!here>`\n\n```\necho <!here>\n```', blocks: [] }, lookup)
    const nodes = markupToJSON(markup ?? '').content ?? []
    expect(references(markup)).toEqual([])
    const codeBlock = allNodes(nodes).find((node) => node.type === MarkupNodeType.code_block)
    expect(codeBlock?.content).toEqual([{ type: MarkupNodeType.text, text: 'echo @here' }])
    expect(texts(nodes)).toContain('ping @here')
  })
})
