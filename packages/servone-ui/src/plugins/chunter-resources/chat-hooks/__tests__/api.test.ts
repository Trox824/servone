import { ServiceApiError } from '../../webhooks/api'
import {
  hookState,
  parseChatAttempts,
  parseChatHook,
  parseChatHookList,
  parseCreatedChatHook,
  parseTestOutcome
} from '../api'

jest.mock('@hcengineering/presentation', () => ({ __esModule: true, default: { metadata: { Token: 'token' } } }))
jest.mock('@hcengineering/platform', () => ({
  ...jest.requireActual('@hcengineering/platform'),
  getMetadata: () => 'token',
  addStringsLoader: () => {}
}))

const HOOK = {
  id: 'AAAAAAAAAAAA',
  channel: 'channel-backend',
  url: 'https://hooks.example.com/in',
  events: ['message.posted', 'thread.reply'],
  mentionsOnly: true,
  peopleOnly: false,
  includeIntegrations: false,
  createdBy: 'u1',
  createdOn: 5,
  disabledOn: null,
  disabledReason: null,
  consecutiveFailures: 2,
  lastAttempt: { at: 9, status: 0, error: 'timeout' }
}

describe('chat hook api parsing', () => {
  it('reads the hook list', () => {
    expect(parseChatHookList({ hooks: [HOOK] })).toEqual([
      {
        id: 'AAAAAAAAAAAA',
        channel: 'channel-backend',
        url: 'https://hooks.example.com/in',
        events: ['message.posted', 'thread.reply'],
        mentionsOnly: true,
        peopleOnly: false,
        includeIntegrations: false,
        createdBy: 'u1',
        createdOn: 5,
        disabledOn: undefined,
        disabledReason: undefined,
        consecutiveFailures: 2,
        lastAttempt: { at: 9, status: 0, error: 'timeout' }
      }
    ])
  })

  it('drops events this front does not know', () => {
    expect(parseChatHookList({ hooks: [{ ...HOOK, events: ['message.posted', 'channel.joined'] }] })[0].events).toEqual(['message.posted'])
  })

  it('reads a created hook with its secret and an edited hook', () => {
    expect(parseCreatedChatHook({ hook: HOOK, secret: 's3cret' })).toMatchObject({ hook: { id: 'AAAAAAAAAAAA' }, secret: 's3cret' })
    expect(parseChatHook({ hook: { ...HOOK, disabledOn: 7, disabledReason: 'failures' } })).toMatchObject({ disabledOn: 7, disabledReason: 'failures' })
  })

  it('reads the log, including a dropped line', () => {
    expect(parseChatAttempts({
      attempts: [
        { at: 1, deliveryId: 'd', event: 'message.posted', attempt: 1, status: 500, error: null, durationMs: 12, responseStart: 'boom', dropped: null },
        { at: 2, deliveryId: '', event: 'message.posted', attempt: 0, status: 0, error: 'dropped', durationMs: 0, responseStart: '', dropped: 37 }
      ]
    })).toEqual([
      { at: 1, deliveryId: 'd', event: 'message.posted', attempt: 1, status: 500, error: undefined, durationMs: 12, responseStart: 'boom', dropped: undefined },
      { at: 2, deliveryId: '', event: 'message.posted', attempt: 0, status: 0, error: 'dropped', durationMs: 0, responseStart: '', dropped: 37 }
    ])
  })

  it('reads a test outcome', () => {
    expect(parseTestOutcome({ status: 200, error: null, durationMs: 3, responseStart: 'ok' })).toEqual({ status: 200, error: undefined, durationMs: 3, responseStart: 'ok' })
  })

  it('rejects malformed answers', () => {
    expect(() => parseChatHookList({ hooks: [{ id: 1 }] })).toThrow(ServiceApiError)
    expect(() => parseChatHookList({ hooks: [{ ...HOOK, mentionsOnly: 'yes' }] })).toThrow(ServiceApiError)
    expect(() => parseChatHookList({ hooks: [{ ...HOOK, disabledReason: 'bored' }] })).toThrow(ServiceApiError)
    expect(() => parseCreatedChatHook({ hook: HOOK })).toThrow(ServiceApiError)
    expect(() => parseChatAttempts({ attempts: 'no' })).toThrow(ServiceApiError)
  })

  it('names the state', () => {
    const [hook] = parseChatHookList({ hooks: [HOOK] })
    expect(hookState(hook)).toBe('active')
    expect(hookState({ ...hook, disabledOn: 1, disabledReason: 'failures' })).toBe('offAfterFailures')
    expect(hookState({ ...hook, disabledOn: 1, disabledReason: 'manual' })).toBe('off')
  })
})
