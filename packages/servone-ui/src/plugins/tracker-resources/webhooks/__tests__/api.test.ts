import { AccountRole, type AccountUuid } from '@hcengineering/core'
import { ServiceApiError } from '../../../chunter-resources/webhooks/api'
import {
  canManageHooks,
  hookState,
  parseAttempts,
  parseCreatedHook,
  parseHook,
  parseHookList,
  parseTestOutcome,
  urlLabel
} from '../api'

jest.mock('@hcengineering/presentation', () => ({ __esModule: true, default: { metadata: { Token: 'token' } } }))
jest.mock('@hcengineering/platform', () => ({ ...jest.requireActual('@hcengineering/platform'), getMetadata: () => 'token' }))

const HOOK = {
  id: 'AAAAAAAAAAAA',
  url: 'https://hooks.example.com/in',
  events: ['issue.created', 'comment.added'],
  createdBy: 'u1',
  createdOn: 5,
  disabledOn: null,
  disabledReason: null,
  consecutiveFailures: 2,
  lastAttempt: { at: 9, status: 0, error: 'timeout' }
}

describe('tracker webhook api parsing', () => {
  it('reads the hook list', () => {
    expect(parseHookList({ hooks: [HOOK, { ...HOOK, id: 'B', disabledOn: 7, disabledReason: 'failures', lastAttempt: null }] })).toEqual([
      {
        id: 'AAAAAAAAAAAA',
        url: 'https://hooks.example.com/in',
        events: ['issue.created', 'comment.added'],
        createdBy: 'u1',
        createdOn: 5,
        disabledOn: undefined,
        disabledReason: undefined,
        consecutiveFailures: 2,
        lastAttempt: { at: 9, status: 0, error: 'timeout' }
      },
      {
        id: 'B',
        url: 'https://hooks.example.com/in',
        events: ['issue.created', 'comment.added'],
        createdBy: 'u1',
        createdOn: 5,
        disabledOn: 7,
        disabledReason: 'failures',
        consecutiveFailures: 2,
        lastAttempt: undefined
      }
    ])
  })

  it('reads one edited hook', () => {
    expect(parseHook({ hook: HOOK }).id).toBe('AAAAAAAAAAAA')
  })

  it('drops events this front does not know, so a newer service does not break the list', () => {
    expect(parseHookList({ hooks: [{ ...HOOK, events: ['issue.created', 'issue.moved'] }] })[0].events).toEqual(['issue.created'])
  })

  it('rejects malformed answers', () => {
    expect(() => parseHookList({ hooks: [{ id: 1 }] })).toThrow(ServiceApiError)
    expect(() => parseHookList({ hooks: [{ ...HOOK, disabledReason: 'bored' }] })).toThrow(ServiceApiError)
    expect(() => parseCreatedHook({ id: 'x' })).toThrow(ServiceApiError)
    expect(() => parseAttempts({ attempts: 'no' })).toThrow(ServiceApiError)
  })

  it('reads the log, the created hook and a test outcome', () => {
    const attempt = {
      at: 1,
      deliveryId: 'd',
      event: 'test',
      attempt: 1,
      status: 500,
      error: null,
      durationMs: 12,
      responseStart: 'nope'
    }
    expect(parseAttempts({ attempts: [attempt] })).toEqual([{ ...attempt, error: undefined }])
    expect(parseCreatedHook({ id: 'x', secret: 's' })).toEqual({ id: 'x', secret: 's' })
    expect(parseTestOutcome({ status: 0, error: 'tls', durationMs: 3, responseStart: '' })).toEqual({
      status: 0,
      error: 'tls',
      durationMs: 3,
      responseStart: ''
    })
  })
})

describe('hookState', () => {
  it('tells active, turned off after failures and turned off by hand apart', () => {
    const [active] = parseHookList({ hooks: [HOOK] })
    expect(hookState(active)).toBe('active')
    expect(hookState({ ...active, disabledOn: 1, disabledReason: 'failures' })).toBe('offAfterFailures')
    expect(hookState({ ...active, disabledOn: 1, disabledReason: 'manual' })).toBe('off')
  })
})

describe('canManageHooks', () => {
  const me = 'me' as AccountUuid
  it('allows Maintainers and project owners, as the service does', () => {
    expect(canManageHooks(AccountRole.Maintainer, me, [])).toBe(true)
    expect(canManageHooks(AccountRole.User, me, [me])).toBe(true)
    expect(canManageHooks(AccountRole.User, me, ['other' as AccountUuid])).toBe(false)
  })
})

describe('urlLabel', () => {
  it('shows host and path without the query', () => {
    expect(urlLabel('https://hooks.example.com/in/abc?token=x')).toBe('hooks.example.com/in/abc')
  })
})
