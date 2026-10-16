import type { IntlString } from '@hcengineering/platform'
import type { RemindPreset } from '../../../lib/remind/remind-time'

export const remindStrings = {
  RemindMe: 'chunter:string:ServoneRemindMe' as IntlString,
  In20m: 'chunter:string:ServoneRemindIn20m' as IntlString,
  In1h: 'chunter:string:ServoneRemindIn1h' as IntlString,
  Tomorrow9: 'chunter:string:ServoneRemindTomorrow9' as IntlString,
  Today9: 'chunter:string:ServoneRemindToday9' as IntlString,
  Custom: 'chunter:string:ServoneRemindCustom' as IntlString,
  ReminderSet: 'chunter:string:ServoneReminderSet' as IntlString,
  CancelReminder: 'chunter:string:ServoneCancelReminder' as IntlString
}

export function presetLabel (preset: RemindPreset, isMorningToday: boolean): IntlString {
  switch (preset) {
    case 'in20m':
      return remindStrings.In20m
    case 'in1h':
      return remindStrings.In1h
    case 'morning':
      return isMorningToday ? remindStrings.Today9 : remindStrings.Tomorrow9
  }
}
