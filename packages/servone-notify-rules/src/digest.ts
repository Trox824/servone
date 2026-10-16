import type { PushSetting } from './push-setting'

export const DIGEST_IDLE_HOURS = [1, 2, 4, 8, 24] as const
export type DigestIdleHours = (typeof DIGEST_IDLE_HOURS)[number]
export const DEFAULT_DIGEST_IDLE_HOURS = 4 satisfies DigestIdleHours

export const DIGEST_LOCALES = ['vi', 'en'] as const
export type DigestLocale = (typeof DIGEST_LOCALES)[number]

export interface DigestSettings {
  isEnabled: boolean
  idleHours: DigestIdleHours
  locale: DigestLocale
}

// Undefined when missing or malformed; the digest is then off.
export function parseDigest (setting: PushSetting | undefined): DigestSettings | undefined {
  const stored = setting?.servoneDigest
  if (typeof stored !== 'object' || stored === null) return undefined
  if (!('isEnabled' in stored && 'idleHours' in stored && 'locale' in stored)) return undefined
  const idleHours = DIGEST_IDLE_HOURS.find((hours) => hours === stored.idleHours)
  const locale = DIGEST_LOCALES.find((candidate) => candidate === stored.locale)
  if (typeof stored.isEnabled !== 'boolean' || idleHours === undefined || locale === undefined) return undefined
  return { isEnabled: stored.isEnabled, idleHours, locale }
}
