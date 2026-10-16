import type { IntlString } from '@hcengineering/platform'

export const notifySettingsString = {
  WorkingHours: 'notification:string:ServoneWorkingHours' as IntlString,
  HoldOutsideHours: 'notification:string:ServoneHoldOutsideHours' as IntlString,
  WorkingHoursHint: 'notification:string:ServoneWorkingHoursHint' as IntlString,
  From: 'notification:string:ServoneFrom' as IntlString,
  To: 'notification:string:ServoneTo' as IntlString,
  TimeZone: 'notification:string:ServoneTimeZone' as IntlString,
  EmailDigest: 'notification:string:ServoneEmailDigest' as IntlString,
  EmailDigestHint: 'notification:string:ServoneEmailDigestHint' as IntlString,
  IdleHours: 'notification:string:ServoneIdleHours' as IntlString
}

export const WEEK: Array<{ day: number, label: IntlString }> = [
  { day: 1, label: 'notification:string:ServoneDayMon' as IntlString },
  { day: 2, label: 'notification:string:ServoneDayTue' as IntlString },
  { day: 3, label: 'notification:string:ServoneDayWed' as IntlString },
  { day: 4, label: 'notification:string:ServoneDayThu' as IntlString },
  { day: 5, label: 'notification:string:ServoneDayFri' as IntlString },
  { day: 6, label: 'notification:string:ServoneDaySat' as IntlString },
  { day: 0, label: 'notification:string:ServoneDaySun' as IntlString }
]
