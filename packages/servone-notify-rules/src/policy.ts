import { parseNotifyLevel, type NotifyContext } from './level'
import { isWorkingTime, type WorkingSchedule } from './schedule'

// Plugin ids of @hcengineering/notification, which is not a dependency: it pulls in svelte through @hcengineering/ui.
export const MENTION_INBOX_NOTIFICATION = 'notification:class:MentionInboxNotification'
export const MENTION_NOTIFICATION_TYPE = 'notification:ids:MentionNotificationType'

// surface: counted, inbox row, toast. quiet: only the channel's bold marker. hidden: nothing.
export type NotifyVisibility = 'surface' | 'quiet' | 'hidden'

// An InboxNotification as the rules read it.
export interface NotifyNotification {
  _class: string
  types?: readonly string[]
}

export interface PolicyInput {
  now: number
  pausedUntil?: number
  schedule?: WorkingSchedule
}

// @everyone / @here arrive as MentionInboxNotification too; an activity row can also carry the mention type.
export function isMention (inboxNotification: NotifyNotification): boolean {
  return (
    inboxNotification._class === MENTION_INBOX_NOTIFICATION ||
    (inboxNotification.types ?? []).includes(MENTION_NOTIFICATION_TYPE)
  )
}

// A thread reply lives on the parent message's own context, which never carries a level, so threads always surface.
export function classify (inboxNotification: NotifyNotification, context: NotifyContext | undefined): NotifyVisibility {
  switch (parseNotifyLevel(context)) {
    case 'all':
      return 'surface'
    case 'nothing':
      return 'hidden'
    case 'mentions':
      return isMention(inboxNotification) ? 'surface' : 'quiet'
  }
}

// Pause and working hours silence alerts only; the inbox still fills.
export function shouldAlert (
  inboxNotification: NotifyNotification,
  context: NotifyContext | undefined,
  input: PolicyInput
): boolean {
  if (input.pausedUntil !== undefined && input.now < input.pausedUntil) return false
  if (input.schedule !== undefined && !isWorkingTime(input.schedule, input.now)) return false
  return classify(inboxNotification, context) === 'surface'
}
