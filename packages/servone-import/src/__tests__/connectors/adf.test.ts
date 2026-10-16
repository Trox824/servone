import { adfNode, adfToMarkdown } from '../../connectors/adf'
import type { Json } from '../../types'

const text = (value: string, marks: Json[] = []): Json => ({ type: 'text', text: value, marks })
const paragraph = (...content: Json[]): Json => ({ type: 'paragraph', content })

describe('adfToMarkdown', () => {
  it('converts the common Jira blocks and marks', () => {
    const doc = adfNode.parse({
      type: 'doc',
      version: 1,
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [text('Steps')] },
        paragraph(text('Run '), text('make', [{ type: 'code' }]), text(' then ask '), { type: 'mention', attrs: { id: 'a1', text: '@Ana' } }, text(' or read '), text('docs', [{ type: 'strong' }, { type: 'link', attrs: { href: 'https://x.io' } }])),
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph(text('one')), { type: 'orderedList', attrs: { order: 3 }, content: [{ type: 'listItem', content: [paragraph(text('nested'))] }] }] },
            { type: 'listItem', content: [paragraph(text('two'))] }
          ]
        },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1')] },
        { type: 'taskList', attrs: { localId: 't' }, content: [{ type: 'taskItem', attrs: { localId: 'i', state: 'DONE' }, content: [text('ship')] }] },
        { type: 'panel', attrs: { panelType: 'info' }, content: [paragraph(text('careful'))] },
        { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'm', type: 'file', collection: 'c', alt: 'screenshot.png', width: 100 } }] },
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph(text('A'))] }, { type: 'tableHeader', content: [paragraph(text('B'))] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(text('1'))] }, { type: 'tableCell', content: [paragraph(text('2'))] }] }
          ]
        }
      ]
    })
    expect(adfToMarkdown(doc)).toBe([
      '## Steps',
      'Run `make` then ask @Ana or read [**docs**](https://x.io)',
      '- one\n  3. nested\n- two',
      '```ts\nconst a = 1\n```',
      '- [x] ship',
      '> careful',
      '[image: screenshot.png]',
      '| A | B |\n| --- | --- |\n| 1 | 2 |'
    ].join('\n\n'))
  })

  it('returns an empty string for a missing description', () => {
    expect(adfToMarkdown(null)).toBe('')
  })
})
