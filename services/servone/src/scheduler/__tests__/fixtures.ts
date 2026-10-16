import type { AccountUuid, Doc, PersonId, Ref, Space } from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'
import type { PersonSpace } from '@hcengineering/contact'
import type { WorkingSchedule } from '@servone/notify-rules'

import type { UnreadNotification } from '../unread'

export const ann = 'ann' as AccountUuid
export const annSpace = 'ann-space' as Ref<PersonSpace>

// Monday 2026-09-28 in Asia/Ho_Chi_Minh (UTC+7).
export function ict (day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, 8, 28 + day, hour - 7, minute)
}

export const officeHours: WorkingSchedule = {
  days: [1, 2, 3, 4, 5],
  start: '08:00',
  end: '17:30',
  timeZone: 'Asia/Ho_Chi_Minh'
}

export function context (
  id: string,
  objectId: string,
  objectSpace: string,
  level?: 'all' | 'mentions' | 'nothing'
): DocNotifyContext & { servoneNotifyLevel?: string } {
  return {
    _id: id as Ref<DocNotifyContext>,
    _class: 'notification:class:DocNotifyContext' as DocNotifyContext['_class'],
    space: annSpace,
    modifiedOn: 0,
    modifiedBy: 'system' as PersonId,
    user: ann,
    objectId: objectId as Ref<Doc>,
    objectClass: 'chunter:class:Channel' as DocNotifyContext['objectClass'],
    objectSpace: objectSpace as Ref<Space>,
    isPinned: false,
    hidden: false,
    servoneNotifyLevel: level
  }
}

interface RowInput {
  id: string
  kind: 'activity' | 'mention' | 'reaction'
  context: string
  message?: string
  createdOn?: number
}

export function row ({ id, kind, context, message, createdOn }: RowInput): UnreadNotification {
  const classes = {
    activity: 'notification:class:ActivityInboxNotification',
    mention: 'notification:class:MentionInboxNotification',
    reaction: 'notification:class:ReactionInboxNotification'
  }
  return {
    _id: id as UnreadNotification['_id'],
    _class: classes[kind] as UnreadNotification['_class'],
    space: annSpace,
    modifiedOn: createdOn ?? 0,
    createdOn,
    modifiedBy: 'bob' as PersonId,
    user: ann,
    isViewed: false,
    archived: false,
    docNotifyContext: context as Ref<DocNotifyContext>,
    objectId: 'object' as Ref<Doc>,
    objectClass: 'chunter:class:Channel' as UnreadNotification['objectClass'],
    attachedTo: kind === 'mention' ? undefined : (message as Ref<Doc> | undefined),
    mentionedIn: kind === 'mention' ? (message as Ref<Doc> | undefined) : undefined
  }
}
