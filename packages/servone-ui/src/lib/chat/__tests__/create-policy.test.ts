import { AccountRole, type Account, type AccountUuid, type PersonId } from '@hcengineering/core'
import {
  CREATE_CHANNEL_CAPABILITY,
  canCreateChannel,
  readCreatePolicy,
  rolesForPolicy,
  withCreatePolicy
} from '../create-policy'

function accountWith (role: AccountRole): Account {
  return { uuid: 'acc' as AccountUuid, role, primarySocialId: 'sid' as PersonId, socialIds: [], fullSocialIds: [] }
}

describe('channel create policy', () => {
  it('defaults to everyone when the key is missing', () => {
    expect(readCreatePolicy(undefined)).toBe('everyone')
    expect(readCreatePolicy({})).toBe('everyone')
    expect(canCreateChannel(accountWith(AccountRole.User), undefined)).toBe(true)
  })

  it('reads admins when User is not listed', () => {
    const map = { [CREATE_CHANNEL_CAPABILITY]: rolesForPolicy('admins') }
    expect(readCreatePolicy(map)).toBe('admins')
    expect(canCreateChannel(accountWith(AccountRole.User), map)).toBe(false)
    expect(canCreateChannel(accountWith(AccountRole.Maintainer), map)).toBe(true)
    expect(canCreateChannel(accountWith(AccountRole.Owner), map)).toBe(true)
  })

  it('never lets guests create', () => {
    expect(canCreateChannel(accountWith(AccountRole.Guest), undefined)).toBe(false)
  })

  it('keeps other capabilities when writing the policy', () => {
    const map = withCreatePolicy({ 'setting:capability:X': [AccountRole.Owner] }, 'admins')
    expect(map['setting:capability:X']).toEqual([AccountRole.Owner])
    expect(map[CREATE_CHANNEL_CAPABILITY]).toEqual([AccountRole.Maintainer, AccountRole.Owner])
  })

  it('reads an emptied role list as everyone', () => {
    expect(readCreatePolicy({ [CREATE_CHANNEL_CAPABILITY]: [] })).toBe('everyone')
  })

  it('blocks every guest role under both policies', () => {
    const maps = [undefined, { [CREATE_CHANNEL_CAPABILITY]: rolesForPolicy('admins') }]
    for (const map of maps) {
      for (const role of [AccountRole.ReadOnlyGuest, AccountRole.DocGuest, AccountRole.Guest]) {
        expect(canCreateChannel(accountWith(role), map)).toBe(false)
      }
    }
  })

  it('round-trips both policies through withCreatePolicy', () => {
    expect(readCreatePolicy(withCreatePolicy(undefined, 'admins'))).toBe('admins')
    expect(readCreatePolicy(withCreatePolicy(withCreatePolicy(undefined, 'admins'), 'everyone'))).toBe('everyone')
  })
})
