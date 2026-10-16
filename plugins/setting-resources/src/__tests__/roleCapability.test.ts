//
// Copyright © 2026 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { AccountRole, hasAccountRole, type Account } from '@hcengineering/core'
import { RoleCapability } from '@hcengineering/setting'
import { DEFAULT_INVITE_LINK_GENERATOR_ROLES } from '../inviteSettingsUtils'
import { getRolesForCapability, hasRoleCapability } from '../roleCapability'

function account (role: AccountRole): Account {
  return { role } as any
}

describe('roleCapability (Generate invite link permission)', () => {
  describe('getRolesForCapability', () => {
    it('uses RoleCapabilitySettings when set', () => {
      expect(
        getRolesForCapability(RoleCapability.GenerateInviteLink, {
          [RoleCapability.GenerateInviteLink]: [AccountRole.Owner]
        })
      ).toEqual([AccountRole.Owner])
    })

    it('uses inviteLinkGeneratorRoles when capability map missing', () => {
      expect(
        getRolesForCapability(RoleCapability.GenerateInviteLink, undefined, [AccountRole.Guest, AccountRole.User])
      ).toEqual([AccountRole.Guest, AccountRole.User])
    })

    it('falls back to DEFAULT_INVITE_LINK_GENERATOR_ROLES (shared with invite settings)', () => {
      expect(getRolesForCapability(RoleCapability.GenerateInviteLink, undefined, undefined)).toBe(
        DEFAULT_INVITE_LINK_GENERATOR_ROLES
      )
    })
  })

  describe('hasRoleCapability', () => {
    it('allows User when falling back to default generator roles', () => {
      expect(
        hasRoleCapability(account(AccountRole.User), RoleCapability.GenerateInviteLink, undefined, undefined)
      ).toBe(true)
    })

    it('denies User when only Owner may generate', () => {
      expect(
        hasRoleCapability(account(AccountRole.User), RoleCapability.GenerateInviteLink, undefined, [AccountRole.Owner])
      ).toBe(false)
    })

    it('allows Owner when only Owner may generate', () => {
      expect(
        hasRoleCapability(account(AccountRole.Owner), RoleCapability.GenerateInviteLink, undefined, [AccountRole.Owner])
      ).toBe(true)
    })

    it('treats an empty override list as unset and falls back to the defaults', () => {
      const emptied = { [RoleCapability.GenerateInviteLink]: [], [RoleCapability.ManageInviteSettings]: [] }
      expect(getRolesForCapability(RoleCapability.GenerateInviteLink, emptied, [AccountRole.Owner])).toEqual([
        AccountRole.Owner
      ])
      expect(getRolesForCapability(RoleCapability.ManageInviteSettings, emptied)).toEqual([
        AccountRole.Maintainer,
        AccountRole.Owner
      ])
    })

    it('grants an unknown capability to nobody', () => {
      expect(hasRoleCapability(account(AccountRole.Owner), 'servone:capability:Unknown', undefined)).toBe(false)
    })

    it('lets only Maintainer and Owner manage invite settings by default', () => {
      const can = (role: AccountRole): boolean =>
        hasRoleCapability(account(role), RoleCapability.ManageInviteSettings, undefined)
      expect(can(AccountRole.User)).toBe(false)
      expect(can(AccountRole.Maintainer)).toBe(true)
      expect(can(AccountRole.Owner)).toBe(true)
    })

    it('denies every guest role generating invite links by default', () => {
      for (const role of [AccountRole.ReadOnlyGuest, AccountRole.DocGuest, AccountRole.Guest]) {
        expect(hasRoleCapability(account(role), RoleCapability.GenerateInviteLink, undefined)).toBe(false)
      }
    })

    it('ranks roles ReadOnlyGuest < DocGuest < Guest < User < Maintainer < Owner', () => {
      const order = [
        AccountRole.ReadOnlyGuest,
        AccountRole.DocGuest,
        AccountRole.Guest,
        AccountRole.User,
        AccountRole.Maintainer,
        AccountRole.Owner
      ]
      order.forEach((role, i) => {
        order.forEach((required, j) => {
          expect(hasAccountRole({ role } as Account, required)).toBe(i >= j)
        })
      })
    })
  })
})
