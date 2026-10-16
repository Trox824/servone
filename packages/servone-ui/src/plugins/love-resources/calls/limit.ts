import { writable } from 'svelte/store'

export const MS_PER_MINUTE = 60 * 1000
export const WARN_MINUTES = 2

export const callConnectedAt = writable<number | undefined>(undefined)

export function remainingMs (connectedAt: number, now: number, maxMinutes: number): number {
  return Math.max(0, connectedAt + maxMinutes * MS_PER_MINUTE - now)
}

export function formatRemaining (remaining: number): string {
  const totalSeconds = Math.ceil(remaining / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`
}

export function isEnding (remaining: number): boolean {
  return remaining <= WARN_MINUTES * MS_PER_MINUTE
}
