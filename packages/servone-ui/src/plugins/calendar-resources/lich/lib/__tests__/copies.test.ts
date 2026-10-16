import { onePerPerson } from '../copies'

const people = new Map([['google-id', 'ann'], ['huly-id', 'ann'], ['bob-id', 'bob']])
const personOf = (socialId: string): string | undefined => people.get(socialId)
const copy = (user: string, access: string, eventId = 'e1'): { eventId: string, user: string, access: string } => ({ eventId, user, access })

describe('onePerPerson', () => {
  it('keeps the owner copy when one person holds two', () => {
    const synced = copy('google-id', 'owner')
    expect(onePerPerson([copy('huly-id', 'reader'), synced], personOf)).toEqual([synced])
  })
  it('keeps one copy for each person on the event', () => {
    expect(onePerPerson([copy('huly-id', 'owner'), copy('bob-id', 'reader')], personOf)).toHaveLength(2)
  })
  it('keeps different events of the same person', () => {
    expect(onePerPerson([copy('huly-id', 'owner', 'e1'), copy('google-id', 'owner', 'e2')], personOf)).toHaveLength(2)
  })
  it('falls back to the social id when the person is unknown', () => {
    expect(onePerPerson([copy('x', 'reader'), copy('y', 'reader')], personOf)).toHaveLength(2)
  })
})
