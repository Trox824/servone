import { readPushTarget, shouldForward, workspaceUrlFromDomain, type GateFacts } from '../gate'

// Friday 2026-09-25: 10:00 and 19:00 in Ho Chi Minh City.
const DAYTIME = Date.parse('2026-09-25T03:00Z')
const EVENING = Date.parse('2026-09-25T12:00Z')
const ACTIVITY = 'notification:class:ActivityInboxNotification'
const MENTION = 'notification:class:MentionInboxNotification'
const office = { isEnabled: true, days: [1, 2, 3, 4, 5], start: '08:00', end: '17:30', timeZone: 'Asia/Ho_Chi_Minh' }

function body (data: object): string {
  return JSON.stringify({ subscriptions: [{ _id: 'sub', user: 'u' }], data })
}

function facts (overrides: Partial<GateFacts> = {}): GateFacts {
  return {
    inboxNotification: { _class: ACTIVITY },
    context: { objectClass: 'chunter:class:Channel' },
    status: undefined,
    pushSetting: { enabled: true },
    ...overrides
  }
}

describe('workspaceUrlFromDomain', () => {
  it('takes the segment after workbench', () => {
    expect(workspaceUrlFromDomain('https://app.servone.vn/workbench/servone-hq')).toBe('servone-hq')
    expect(workspaceUrlFromDomain('https://app.servone.vn/workbench/servone-hq/')).toBe('servone-hq')
    expect(workspaceUrlFromDomain('workbench/servone-hq')).toBe('servone-hq')
  })
  it('rejects anything else', () => {
    expect(workspaceUrlFromDomain('')).toBeUndefined()
    expect(workspaceUrlFromDomain('https://app.servone.vn')).toBeUndefined()
    expect(workspaceUrlFromDomain('https://app.servone.vn/login/servone-hq')).toBeUndefined()
  })
})

describe('readPushTarget', () => {
  it('reads tag and workspace from the transactor body', () => {
    expect(readPushTarget(body({ title: 't', body: 'b', tag: 'n1', domain: 'https://x.vn/workbench/hq' }))).toEqual({
      inboxNotificationId: 'n1',
      workspaceUrl: 'hq'
    })
  })
  it.each([
    ['not JSON', '{'],
    ['no data', JSON.stringify({ subscriptions: [] })],
    ['data null', JSON.stringify({ data: null })],
    ['no tag', body({ domain: 'https://x.vn/workbench/hq' })],
    ['empty tag', body({ tag: '', domain: 'https://x.vn/workbench/hq' })],
    ['tag not string', body({ tag: 5, domain: 'https://x.vn/workbench/hq' })],
    ['no domain', body({ tag: 'n1' })],
    ['domain without workbench', body({ tag: 'n1', domain: 'https://x.vn' })]
  ])('is undefined for %s', (_name, text) => {
    expect(readPushTarget(text)).toBeUndefined()
  })
})

describe('shouldForward', () => {
  it('forwards by default', () => {
    expect(shouldForward(facts(), DAYTIME)).toBe(true)
    expect(shouldForward(facts({ context: undefined, pushSetting: undefined }), DAYTIME)).toBe(true)
  })
  it('applies the channel level', () => {
    const mentionsOnly = { objectClass: 'chunter:class:Channel', servoneNotifyLevel: 'mentions' }
    expect(shouldForward(facts({ context: mentionsOnly }), DAYTIME)).toBe(false)
    expect(shouldForward(facts({ context: mentionsOnly, inboxNotification: { _class: MENTION } }), DAYTIME)).toBe(true)
    const nothing = { objectClass: 'chunter:class:Channel', servoneNotifyLevel: 'nothing' }
    expect(shouldForward(facts({ context: nothing, inboxNotification: { _class: MENTION } }), DAYTIME)).toBe(false)
  })
  it('holds while paused and forwards after', () => {
    const status = { message: '', servonePausedUntil: DAYTIME + 60_000 }
    expect(shouldForward(facts({ status }), DAYTIME)).toBe(false)
    expect(shouldForward(facts({ status }), DAYTIME + 60_000)).toBe(true)
  })
  it('holds outside working hours only when they are on', () => {
    expect(shouldForward(facts({ pushSetting: { enabled: true, servoneSchedule: office } }), DAYTIME)).toBe(true)
    expect(shouldForward(facts({ pushSetting: { enabled: true, servoneSchedule: office } }), EVENING)).toBe(false)
    const off = { enabled: true, servoneSchedule: { ...office, isEnabled: false } }
    expect(shouldForward(facts({ pushSetting: off }), EVENING)).toBe(true)
  })
  it('ignores a malformed schedule rather than holding everything', () => {
    const broken = { enabled: true, servoneSchedule: { ...office, timeZone: 'Nowhere/City' } }
    expect(shouldForward(facts({ pushSetting: broken }), EVENING)).toBe(true)
  })
})
