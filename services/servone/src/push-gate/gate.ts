import {
  parseSchedule,
  readPause,
  shouldAlert,
  type NotifyContext,
  type NotifyNotification,
  type PushSetting,
  type StoredPause
} from '@servone/notify-rules'

// What the gate needs from the transactor's POST /web-push body (server-plugins/notification-resources/src/push.ts,
// createPushNotification): data.tag is the InboxNotification _id, data.domain is `${front}/workbench/${workspace url}`.
export interface PushTarget {
  inboxNotificationId: string
  workspaceUrl: string
}

export function workspaceUrlFromDomain (domain: string): string | undefined {
  const segments = domain.split('/').filter((segment) => segment !== '')
  return segments.length >= 2 && segments[segments.length - 2] === 'workbench' ? segments[segments.length - 1] : undefined
}

export function readPushTarget (body: string): PushTarget | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch (err) {
    if (err instanceof SyntaxError) return undefined
    throw err
  }
  if (typeof parsed !== 'object' || parsed === null || !('data' in parsed)) return undefined
  const data = parsed.data
  if (typeof data !== 'object' || data === null || !('tag' in data) || !('domain' in data)) return undefined
  const { tag, domain } = data
  if (typeof tag !== 'string' || tag === '' || typeof domain !== 'string') return undefined
  const workspaceUrl = workspaceUrlFromDomain(domain)
  return workspaceUrl === undefined ? undefined : { inboxNotificationId: tag, workspaceUrl }
}

export interface GateFacts {
  inboxNotification: NotifyNotification
  context: NotifyContext | undefined
  status: StoredPause | undefined
  pushSetting: PushSetting | undefined
}

export function shouldForward (facts: GateFacts, now: number): boolean {
  return shouldAlert(facts.inboxNotification, facts.context, {
    now,
    pausedUntil: readPause(facts.status)?.until,
    schedule: parseSchedule(facts.pushSetting)
  })
}
