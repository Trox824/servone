import type { Class, Doc, Hierarchy, PersonId, Ref, Space, Timestamp } from '@hcengineering/core'

export const eventClass = 'calendar:class:Event' as Ref<Class<ReminderEvent>>
export const calendarSpace = 'calendar:space:Calendar' as Ref<Space>
export const activityMessageClass = 'activity:class:ActivityMessage' as Ref<Class<Doc>>

export interface ReminderEvent extends Doc {
  calendar: Ref<Doc>
  eventId: string
  attachedTo: Ref<Doc>
  attachedToClass: Ref<Class<Doc>>
  collection: string
  title: string
  description: string
  date: Timestamp
  dueDate: Timestamp
  allDay: boolean
  participants: Array<Ref<Doc>>
  reminders: number[]
  access: 'owner'
  blockTime: boolean
  user: PersonId
}

export function isMessageReminder (hierarchy: Hierarchy, doc: Doc): doc is ReminderEvent {
  if (!hierarchy.isDerived(doc._class, eventClass)) return false
  const attachedToClass = 'attachedToClass' in doc ? doc.attachedToClass : undefined
  if (typeof attachedToClass !== 'string') return false
  return hierarchy.isDerived(attachedToClass as Ref<Class<Doc>>, activityMessageClass)
}
