import type { Person } from '@hcengineering/contact'
import { AccountRole, type AccountUuid, type PersonId, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import { type ChangeRecord, type ConfigSession, parseChangeId, type Plan } from '@servone/config'

import type { WorkspaceSession } from '../types'

export const ME_ACCOUNT = 'acc-me' as AccountUuid
export const ME_PERSON = 'person-me' as Ref<Person>
export const ME_SOCIAL = 'social-me' as PersonId
export const WORKSPACE = 'ws-1' as WorkspaceUuid

export function fakeSession (): WorkspaceSession {
  return {
    workspace: WORKSPACE,
    account: {
      uuid: ME_ACCOUNT,
      role: AccountRole.User,
      primarySocialId: ME_SOCIAL,
      socialIds: [ME_SOCIAL],
      fullSocialIds: []
    },
    person: ME_PERSON,
    client: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      addCollection: jest.fn(),
      removeCollection: jest.fn(),
      updateDoc: jest.fn(),
      update: jest.fn(),
      getHierarchy: jest.fn(),
      tx: jest.fn()
    },
    rest: { searchFulltext: jest.fn(), findAll: jest.fn() },
    collab: { readMarkdown: jest.fn(), writeMarkdown: jest.fn(), updateMarkdown: jest.fn() }
  }
}

export function configOf (session: WorkspaceSession): ConfigSession {
  return { client: { findAll: expect.any(Function), tx: expect.any(Function) }, account: session.account }
}

export function draftPlan (overrides: Partial<Plan> = {}): Plan {
  return {
    ops: [],
    inverse: [],
    txes: [],
    risk: 'safe',
    diff: [],
    issues: [],
    modelVersion: 'v1',
    typeKeys: [],
    summary: '',
    ...overrides
  }
}

export function changeRecord (overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    id: parseChangeId('change-1'),
    summary: 'Tạo loại hồ sơ Đề nghị công tác',
    status: 'draft',
    risk: 'safe',
    ops: [],
    inverse: [],
    diff: [{ text: 'Tạo loại hồ sơ *Đề nghị công tác*', risk: 'safe' }],
    typeKeys: ['cong-tac'],
    author: ME_SOCIAL,
    modelVersion: 'v1',
    createdOn: Date.UTC(2026, 8, 26, 9, 30),
    ...overrides
  }
}
