export type NotifyLevel = 'all' | 'mentions' | 'nothing'

export const NOTIFY_LEVELS: NotifyLevel[] = ['all', 'mentions', 'nothing']

// A DocNotifyContext as the rules read it. servoneNotifyLevel is an extra JSONB key any client can write.
export interface NotifyContext {
  objectClass: string
  servoneNotifyLevel?: unknown
}

export function parseNotifyLevel (context: NotifyContext | undefined): NotifyLevel {
  const stored = context?.servoneNotifyLevel
  return NOTIFY_LEVELS.find((level) => level === stored) ?? 'all'
}
