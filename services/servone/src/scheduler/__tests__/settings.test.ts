import type { PersonId, Ref } from '@hcengineering/core'

import { readPrefs, type SchedulerSetting } from '../settings'
import { officeHours } from './fixtures'

function setting (fields: Partial<SchedulerSetting>): SchedulerSetting {
  return {
    _id: 'setting' as Ref<SchedulerSetting>,
    _class: 'notification:class:NotificationProviderSetting' as SchedulerSetting['_class'],
    space: 'workspace' as SchedulerSetting['space'],
    modifiedOn: 0,
    modifiedBy: 'ann' as PersonId,
    attachedTo: 'notification:providers:PushNotificationProvider' as SchedulerSetting['attachedTo'],
    enabled: true,
    ...fields
  }
}

describe('readPrefs', () => {
  it('skips users with neither working hours nor the digest', () => {
    expect(readPrefs(setting({}))).toBeUndefined()
    expect(readPrefs(setting({ servoneSchedule: { ...officeHours, isEnabled: false } }))).toBeUndefined()
    expect(readPrefs(setting({ servoneDigest: { isEnabled: false, idleHours: 4, locale: 'en' } }))).toBeUndefined()
  })

  it('reads the schedule, digest and bookkeeping', () => {
    const prefs = readPrefs(
      setting({
        servoneSchedule: { ...officeHours, isEnabled: true },
        servoneDigest: { isEnabled: true, idleHours: 4, locale: 'en' },
        servoneHeldSince: 100,
        servoneSummarySentAt: 'yesterday'
      })
    )
    expect(prefs).toEqual({
      schedule: officeHours,
      digest: { isEnabled: true, idleHours: 4, locale: 'en' },
      locale: 'en',
      heldSince: 100,
      summarySentAt: undefined,
      digestSentAt: undefined
    })
  })

  it('keeps the chosen language for the summary while the digest is off', () => {
    const prefs = readPrefs(
      setting({
        servoneSchedule: { ...officeHours, isEnabled: true },
        servoneDigest: { isEnabled: false, idleHours: 4, locale: 'en' }
      })
    )
    expect(prefs?.locale).toBe('en')
    expect(prefs?.digest).toBeUndefined()
  })

  it('defaults to Vietnamese', () => {
    expect(readPrefs(setting({ servoneSchedule: { ...officeHours, isEnabled: true } }))?.locale).toBe('vi')
  })
})
