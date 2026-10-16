import { handoffToJson, parseHandoff, type Handoff } from '../handoff'

const handoff: Handoff = { stage: 'status-approved', target: 'project-b', assignee: { kind: 'person', person: 'person-1' } }

describe('parseHandoff', () => {
  it('round-trips a rule', () => {
    expect(parseHandoff({ servoneHandoff: handoffToJson(handoff) })).toEqual(handoff)
  })

  it('is off for a project without a rule', () => {
    expect(parseHandoff({})).toBeUndefined()
  })

  it.each([
    ['malformed JSON', '{"stage":'],
    ['no target', JSON.stringify({ stage: 's', assignee: { kind: 'none' } })],
    ['an unknown assignee', JSON.stringify({ stage: 's', target: 't', assignee: { kind: 'team' } })],
    ['a person rule without a person', JSON.stringify({ stage: 's', target: 't', assignee: { kind: 'person' } })]
  ])('is off for %s', (_, stored) => {
    expect(parseHandoff({ servoneHandoff: stored })).toBeUndefined()
  })
})
