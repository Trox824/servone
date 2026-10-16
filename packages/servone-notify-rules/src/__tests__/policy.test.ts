import { parseNotifyLevel, type NotifyLevel } from '../level'
import { classify, isMention, MENTION_INBOX_NOTIFICATION, MENTION_NOTIFICATION_TYPE, shouldAlert } from '../policy'
import type { WorkingSchedule } from '../schedule'

const CHANNEL = 'chunter:class:Channel'
const CHAT_MESSAGE = 'chunter:class:ChatMessage'
const ACTIVITY = 'notification:class:ActivityInboxNotification'
// Friday 2026-09-25 10:00 in Ho Chi Minh City.
const NOW = Date.parse('2026-09-25T03:00Z')

function context (objectClass: string, level?: unknown): { objectClass: string, servoneNotifyLevel?: unknown } {
  return level === undefined ? { objectClass } : { objectClass, servoneNotifyLevel: level }
}

const activity = { _class: ACTIVITY }
const mention = { _class: MENTION_INBOX_NOTIFICATION }
const activityWithMentionType = { _class: ACTIVITY, types: [MENTION_NOTIFICATION_TYPE] }
const office: WorkingSchedule = { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:30', timeZone: 'Asia/Ho_Chi_Minh' }

describe('parseNotifyLevel', () => {
  it('defaults a missing context or field to all', () => {
    expect(parseNotifyLevel(undefined)).toBe('all')
    expect(parseNotifyLevel(context(CHANNEL))).toBe('all')
  })
  it.each<NotifyLevel>(['all', 'mentions', 'nothing'])('reads %s', (level) => {
    expect(parseNotifyLevel(context(CHANNEL, level))).toBe(level)
  })
  it.each([42, 'loud', null, { level: 'nothing' }, ['nothing']])('treats stored %p as all', (stored) => {
    expect(parseNotifyLevel(context(CHANNEL, stored))).toBe('all')
  })
})

describe('isMention', () => {
  it('recognises mention rows and activity rows typed as mention', () => {
    expect(isMention(mention)).toBe(true)
    expect(isMention(activityWithMentionType)).toBe(true)
    expect(isMention(activity)).toBe(false)
    expect(isMention({ _class: ACTIVITY, types: [] })).toBe(false)
  })
})

describe('classify', () => {
  it.each([
    ['all', activity, 'surface'],
    ['all', mention, 'surface'],
    ['mentions', activity, 'quiet'],
    ['mentions', mention, 'surface'],
    ['mentions', activityWithMentionType, 'surface'],
    ['nothing', activity, 'hidden'],
    ['nothing', mention, 'hidden']
  ])('level %s', (level, row, expected) => {
    expect(classify(row, context(CHANNEL, level))).toBe(expected)
  })
  it('surfaces thread replies, whose context is the parent message', () => {
    expect(classify(activity, context(CHAT_MESSAGE))).toBe('surface')
    expect(classify(mention, context(CHAT_MESSAGE))).toBe('surface')
  })
  it('surfaces rows whose context has not loaded', () => {
    expect(classify(activity, undefined)).toBe('surface')
  })
})

describe('shouldAlert', () => {
  it('follows classify with no pause or schedule', () => {
    expect(shouldAlert(activity, context(CHANNEL, 'all'), { now: NOW })).toBe(true)
    expect(shouldAlert(activity, context(CHANNEL, 'mentions'), { now: NOW })).toBe(false)
    expect(shouldAlert(mention, context(CHANNEL, 'mentions'), { now: NOW })).toBe(true)
    expect(shouldAlert(mention, context(CHANNEL, 'nothing'), { now: NOW })).toBe(false)
    expect(shouldAlert(activity, context(CHAT_MESSAGE), { now: NOW })).toBe(true)
  })
  it('stays silent while paused, even for mentions and threads', () => {
    const paused = { now: NOW, pausedUntil: NOW + 1 }
    expect(shouldAlert(mention, context(CHANNEL, 'all'), paused)).toBe(false)
    expect(shouldAlert(activity, context(CHAT_MESSAGE), paused)).toBe(false)
  })
  it('alerts again once the pause has ended', () => {
    expect(shouldAlert(mention, context(CHANNEL), { now: NOW, pausedUntil: NOW })).toBe(true)
  })
  it('alerts inside working hours and holds outside them, mentions included', () => {
    expect(shouldAlert(mention, context(CHANNEL), { now: NOW, schedule: office })).toBe(true)
    const evening = Date.parse('2026-09-25T12:00Z')
    expect(shouldAlert(mention, context(CHANNEL), { now: evening, schedule: office })).toBe(false)
    expect(shouldAlert(activity, context(CHAT_MESSAGE), { now: evening, schedule: office })).toBe(false)
  })
  it('still applies the level inside working hours', () => {
    expect(shouldAlert(activity, context(CHANNEL, 'nothing'), { now: NOW, schedule: office })).toBe(false)
  })
})
