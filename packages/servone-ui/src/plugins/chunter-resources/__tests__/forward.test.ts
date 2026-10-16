import type { Class, Doc, PersonId, Ref, Space } from '@hcengineering/core'
import { buildForwardMarkup } from '../forward/markup'
import { readForwardedFrom } from '../forward/origin'

const text = (t: string): object => ({ type: 'text', text: t })
const ref = (id: string, label: string, extra: object = {}): object => ({
  type: 'reference',
  attrs: { id, objectclass: 'contact:class:Person', label, ...extra }
})
const doc = (...content: object[]): string => JSON.stringify({ type: 'doc', content })
const para = (...content: object[]): object => ({ type: 'paragraph', content })

describe('buildForwardMarkup', () => {
  it('puts the note first and quotes the original', () => {
    const forwarded = JSON.parse(buildForwardMarkup(doc(para(text('hello'))), 'see this\n\nplease'))
    expect(forwarded).toEqual({
      type: 'doc',
      content: [
        para(text('see this')),
        para(text('please')),
        { type: 'blockquote', content: [para(text('hello'))] }
      ]
    })
  })

  it('turns mentions into plain text and merges it with neighbours', () => {
    const forwarded = JSON.parse(buildForwardMarkup(doc(para(text('hi '), ref('p1', 'Lan'), text('!'))), ''))
    expect(forwarded.content).toEqual([{ type: 'blockquote', content: [para(text('hi @Lan!'))] }])
  })

  it('drops the hidden team member nodes but keeps the team name', () => {
    const original = doc(
      para(
        ref('d1', 'sales', { objectclass: 'hr:class:Department' }),
        ref('p1', '', { servoneTeam: 'd1' }),
        ref('p2', '', { servoneTeam: 'd1' }),
        text(' update')
      )
    )
    const forwarded = JSON.parse(buildForwardMarkup(original, ''))
    expect(forwarded.content[0].content).toEqual([para(text('@sales update'))])
  })

  it('keeps marked text separate', () => {
    const bold = { type: 'text', text: 'x', marks: [{ type: 'bold' }] }
    const forwarded = JSON.parse(buildForwardMarkup(doc(para(text('a'), bold, text('b'))), ''))
    expect(forwarded.content[0].content[0].content).toEqual([text('a'), bold, text('b')])
  })

  it('quotes an empty paragraph for a message with no text', () => {
    const forwarded = JSON.parse(buildForwardMarkup(doc(), ''))
    expect(forwarded.content).toEqual([{ type: 'blockquote', content: [{ type: 'paragraph' }] }])
  })

  it('quotes legacy HTML as text', () => {
    const forwarded = JSON.parse(buildForwardMarkup('<p>old</p>', ''))
    expect(forwarded.content[0].content).toEqual([para(text('<p>old</p>'))])
  })
})

function message (extra: object): Doc {
  return {
    _id: 'm2' as Ref<Doc>,
    _class: 'chunter:class:ChatMessage' as Ref<Class<Doc>>,
    space: 'c2' as Ref<Space>,
    modifiedOn: 0,
    modifiedBy: 'social2' as PersonId,
    ...extra
  }
}

describe('readForwardedFrom', () => {
  const origin = {
    messageId: 'm1',
    messageClass: 'chunter:class:ChatMessage',
    channelId: 'c1',
    channelClass: 'chunter:class:Channel',
    author: 'social1',
    createdOn: 5
  }

  it('reads a stored origin', () => {
    expect(readForwardedFrom(message({ servoneForwardedFrom: origin }))).toEqual(origin)
  })
  it('ignores a missing or malformed origin', () => {
    expect(readForwardedFrom(message({}))).toBeUndefined()
    expect(readForwardedFrom(message({ servoneForwardedFrom: 'x' }))).toBeUndefined()
    expect(readForwardedFrom(message({ servoneForwardedFrom: { ...origin, channelId: 3 } }))).toBeUndefined()
  })
  it('defaults a missing timestamp', () => {
    const { createdOn, ...rest } = origin
    expect(readForwardedFrom(message({ servoneForwardedFrom: rest }))?.createdOn).toBe(0)
  })
})
