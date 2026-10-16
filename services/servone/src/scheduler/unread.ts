import type { Doc, Markup, Ref } from '@hcengineering/core'
import type { DocNotifyContext, InboxNotification } from '@hcengineering/notification'
import { classify, isMention } from '@servone/notify-rules'

// notification.class.ActivityInboxNotification; the plugin's runtime pulls in @hcengineering/ui.
const ACTIVITY_INBOX_NOTIFICATION = 'notification:class:ActivityInboxNotification'

// Activity rows carry `attachedTo`, mention rows `mentionedIn`; both point at the message.
// messageHtml is the mention's own excerpt, used when the mention is not in a chat message.
export interface UnreadNotification extends InboxNotification {
  attachedTo?: Ref<Doc>
  mentionedIn?: Ref<Doc>
  messageHtml?: Markup
}

export type UnreadKind = 'mention' | 'direct'

export interface UnreadItem {
  notification: UnreadNotification
  context: DocNotifyContext | undefined
  kind: UnreadKind
  message: Ref<Doc> | undefined
}

export interface UnreadCounts {
  mentions: number
  directs: number
}

// A thread reply's context is the parent message, whose objectSpace is the DM.
function isDirect (context: DocNotifyContext, directs: ReadonlySet<Ref<Doc>>): boolean {
  return directs.has(context.objectId) || directs.has(context.objectSpace)
}

function toItem (
  candidate: UnreadNotification,
  context: DocNotifyContext | undefined,
  directs: ReadonlySet<Ref<Doc>>
): UnreadItem | undefined {
  if (classify(candidate, context) !== 'surface') return undefined
  if (isMention(candidate)) {
    return { notification: candidate, context, kind: 'mention', message: candidate.mentionedIn ?? candidate.attachedTo }
  }
  if (candidate._class !== ACTIVITY_INBOX_NOTIFICATION) return undefined
  if (context === undefined || !isDirect(context, directs)) return undefined
  return { notification: candidate, context, kind: 'direct', message: candidate.attachedTo }
}

// Mentions anywhere plus plain DM messages, minus what the user's channel level hides or quiets.
// One message can raise both a mention row and an activity row; it counts once, as a mention.
export function selectUnread (
  notifications: readonly UnreadNotification[],
  contexts: ReadonlyMap<Ref<DocNotifyContext>, DocNotifyContext>,
  directs: ReadonlySet<Ref<Doc>>
): UnreadItem[] {
  const candidates = notifications
    .map((candidate) => toItem(candidate, contexts.get(candidate.docNotifyContext), directs))
    .filter((item): item is UnreadItem => item !== undefined)
  const mentionsFirst = [
    ...candidates.filter((item) => item.kind === 'mention'),
    ...candidates.filter((item) => item.kind === 'direct')
  ]
  const seenMessages = new Set<Ref<Doc>>()
  const items: UnreadItem[] = []
  for (const item of mentionsFirst) {
    if (item.message !== undefined) {
      if (seenMessages.has(item.message)) continue
      seenMessages.add(item.message)
    }
    items.push(item)
  }
  return items
}

export function countUnread (items: readonly UnreadItem[]): UnreadCounts {
  return {
    mentions: items.filter((item) => item.kind === 'mention').length,
    directs: items.filter((item) => item.kind === 'direct').length
  }
}
