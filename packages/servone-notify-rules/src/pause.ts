const MINUTE = 60_000
const TOMORROW_HOUR = 8

export type PausePreset = 'for30m' | 'for1h' | 'for2h' | 'untilTomorrow'

export const PAUSE_PRESETS: PausePreset[] = ['for30m', 'for1h', 'for2h', 'untilTomorrow']

// A WorkspaceMemberStatus as pause reads it. servonePausedUntil is an extra JSONB key any client can write.
export interface StoredPause {
  message: string
  servonePausedUntil?: unknown
}

export interface Pause {
  until: number
}

export function readPause (status: StoredPause | undefined): Pause | undefined {
  const until = status?.servonePausedUntil
  if (typeof until !== 'number' || !Number.isFinite(until) || until <= 0) return undefined
  return { until }
}

// Runs in the browser: "tomorrow 08:00" is the device's local time.
export function presetUntil (preset: PausePreset, now: number): number {
  switch (preset) {
    case 'for30m':
      return now + 30 * MINUTE
    case 'for1h':
      return now + 60 * MINUTE
    case 'for2h':
      return now + 120 * MINUTE
    case 'untilTomorrow': {
      const day = new Date(now)
      day.setDate(day.getDate() + 1)
      day.setHours(TOMORROW_HOUR, 0, 0, 0)
      return day.getTime()
    }
  }
}

export function isValidCustomUntil (until: number, now: number): boolean {
  return Number.isFinite(until) && until > now
}
