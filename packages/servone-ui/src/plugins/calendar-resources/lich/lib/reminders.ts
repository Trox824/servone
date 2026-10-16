export const DEFAULT_REMINDER_ATTR = 'servoneDefaultReminder'
export const DEFAULT_ALL_DAY_REMINDER_ATTR = 'servoneDefaultAllDayReminder'
export const DEFAULT_DURATION_ATTR = 'servoneDefaultDuration'
const MINUTE_MS = 60 * 1000
export const DURATION_CHOICES = [15, 30, 45, 60].map((minutes) => minutes * MINUTE_MS)
const DEFAULT_DURATION = 60 * MINUTE_MS
export const MAX_REMINDERS = 5
export const DEFAULT_TIMED_REMINDER = 10 * 60 * 1000
export const NO_REMINDER = -1

export interface ReminderDefaults {
  _id: string
  servoneDefaultReminder?: number
  servoneDefaultAllDayReminder?: number
  servoneDefaultDuration?: number
}

export function defaultReminders (calendar: ReminderDefaults | undefined, allDay: boolean): number[] {
  const stored = allDay ? calendar?.servoneDefaultAllDayReminder : calendar?.servoneDefaultReminder
  if (stored === undefined) return allDay ? [] : [DEFAULT_TIMED_REMINDER]
  return stored === NO_REMINDER ? [] : [stored]
}

export function canAddReminder (reminders: number[]): boolean {
  return reminders.length < MAX_REMINDERS
}

export function defaultDuration (calendar: ReminderDefaults | undefined): number {
  return calendar?.servoneDefaultDuration ?? DEFAULT_DURATION
}
