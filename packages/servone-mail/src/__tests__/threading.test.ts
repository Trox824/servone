import type { Ref } from '@hcengineering/core'
import type { MailThreadCard } from '../fields'
import { findThread, type IncomingMessage, subjectKey, type ThreadLookup } from '../threading'

const T1 = 't1' as Ref<MailThreadCard>
const DAY = 24 * 60 * 60 * 1000

function lookupWith (overrides: Partial<ThreadLookup>): ThreadLookup {
  return {
    byProviderThreadId: async () => undefined,
    byMessageIds: async () => undefined,
    bySubjectKey: async () => [],
    ...overrides
  }
}

function incoming (overrides: Partial<IncomingMessage>): IncomingMessage {
  return { messageId: '<m2@x>', inReplyTo: '', references: [], subject: 'Re: Báo giá', sentAt: 100 * DAY, participants: ['a@x.vn'], providerThreadId: '', ...overrides }
}

describe('subjectKey', () => {
  it.each([
    ['Re: Re: Báo giá tháng 10', 'báo giá tháng 10'],
    ['TR: Báo giá', 'báo giá'],
    ['RE [2]: Hợp đồng', 'hợp đồng'],
    ['Fwd:   Hello  world', 'hello world'],
    ['AW: SV: Rechnung', 'rechnung']
  ])('normalizes %s', (subject, key) => {
    expect(subjectKey(subject)).toBe(key)
  })
})

describe('findThread', () => {
  it('trusts the provider thread id and does not fall back', async () => {
    const lookup = lookupWith({ byProviderThreadId: async () => undefined, byMessageIds: async () => T1 })
    expect(await findThread(incoming({ providerThreadId: 'gm-1', inReplyTo: '<m1@x>' }), lookup)).toBeUndefined()
  })

  it('follows In-Reply-To and References', async () => {
    const lookup = lookupWith({ byMessageIds: async (ids) => (ids.includes('<m1@x>') ? T1 : undefined) })
    expect(await findThread(incoming({ references: ['<m0@x>', '<m1@x>'] }), lookup)).toBe(T1)
  })

  it('falls back to subject only with a shared participant inside 30 days', async () => {
    let since = 0
    const lookup = lookupWith({
      bySubjectKey: async (_key, from) => {
        since = from
        return [{ thread: T1, participants: ['a@x.vn'] }]
      }
    })
    expect(await findThread(incoming({}), lookup)).toBe(T1)
    expect(since).toBe(70 * DAY)
    expect(await findThread(incoming({ participants: ['z@x.vn'] }), lookup)).toBeUndefined()
  })

  it('never matches an empty subject', async () => {
    const lookup = lookupWith({ bySubjectKey: async () => [{ thread: T1, participants: ['a@x.vn'] }] })
    expect(await findThread(incoming({ subject: 'Re:' }), lookup)).toBeUndefined()
  })
})
