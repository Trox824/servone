import type { AccountUuid } from '@hcengineering/core'
import { lacksOwners, pickBackfillOwners } from '../channel-owners'

const alice = 'alice' as AccountUuid
const bob = 'bob' as AccountUuid
const carol = 'carol' as AccountUuid

describe('channel owner backfill', () => {
  it('flags channels with missing or empty owners', () => {
    expect(lacksOwners({})).toBe(true)
    expect(lacksOwners({ owners: [] })).toBe(true)
    expect(lacksOwners({ owners: [alice] })).toBe(false)
  })

  it('prefers workspace owners over the creator', () => {
    expect(pickBackfillOwners([alice, bob], carol)).toEqual([alice, bob])
  })

  it('drops duplicate workspace owners', () => {
    expect(pickBackfillOwners([alice, alice], undefined)).toEqual([alice])
  })

  it('falls back to the creator when the workspace has no owner', () => {
    expect(pickBackfillOwners([], carol)).toEqual([carol])
  })

  it('returns no owners when neither is known', () => {
    expect(pickBackfillOwners([], undefined)).toEqual([])
  })
})
