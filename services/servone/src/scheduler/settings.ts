import type { NotificationProviderSetting } from '@hcengineering/notification'
import {
  parseDigest,
  parseSchedule,
  type DigestLocale,
  type DigestSettings,
  type PushSetting,
  type WorkingSchedule
} from '@servone/notify-rules'

// The user's Push setting. The bookkeeping keys are extra JSONB that only this service writes.
export interface SchedulerSetting extends NotificationProviderSetting, PushSetting {
  servoneHeldSince?: unknown
  servoneSummarySentAt?: unknown
  servoneDigestSentAt?: unknown
}

// Servone's workforce reads Vietnamese; used until the user picks a digest language.
const DEFAULT_LOCALE = 'vi' satisfies DigestLocale

type BookkeepingKey = 'servoneHeldSince' | 'servoneSummarySentAt' | 'servoneDigestSentAt'

export interface UserPrefs {
  schedule?: WorkingSchedule
  // Only set while the digest is switched on.
  digest?: DigestSettings
  locale: DigestLocale
  // Start of the current or last off-hours stretch.
  heldSince?: number
  summarySentAt?: number
  digestSentAt?: number
}

function readTimestamp (setting: SchedulerSetting, key: BookkeepingKey): number | undefined {
  const stored = setting[key]
  return typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? stored : undefined
}

// Undefined when the user has neither working hours nor the digest on: the scheduler has nothing to do.
export function readPrefs (setting: SchedulerSetting): UserPrefs | undefined {
  const schedule = parseSchedule(setting)
  const digest = parseDigest(setting)
  const enabledDigest = digest?.isEnabled === true ? digest : undefined
  if (schedule === undefined && enabledDigest === undefined) return undefined
  return {
    schedule,
    digest: enabledDigest,
    locale: digest?.locale ?? DEFAULT_LOCALE,
    heldSince: readTimestamp(setting, 'servoneHeldSince'),
    summarySentAt: readTimestamp(setting, 'servoneSummarySentAt'),
    digestSentAt: readTimestamp(setting, 'servoneDigestSentAt')
  }
}
