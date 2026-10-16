import type { Doc, Ref } from '@hcengineering/core'
import { createQuery, onClient } from '@hcengineering/presentation'
import { readable, type Readable } from 'svelte/store'

import { activityMessageClass, eventClass, type ReminderEvent } from '../../../lib/remind/reminder-event'

export type RemindersByMessage = Map<Ref<Doc>, ReminderEvent[]>

let pending: Readable<RemindersByMessage> | undefined

export function pendingReminders (): Readable<RemindersByMessage> {
  if (pending !== undefined) return pending
  pending = readable<RemindersByMessage>(new Map(), (set) => {
    const query = createQuery(true)
    onClient((client, account) => {
      const messageClasses = client.getHierarchy().getDescendants(activityMessageClass)
      query.query(
        eventClass,
        { user: { $in: account.socialIds }, attachedToClass: { $in: messageClasses } },
        (events) => {
          const byMessage: RemindersByMessage = new Map()
          for (const event of events) byMessage.set(event.attachedTo, [...(byMessage.get(event.attachedTo) ?? []), event])
          set(byMessage)
        }
      )
    })
  })
  return pending
}

export function futureReminders (events: ReminderEvent[] | undefined, now: number): ReminderEvent[] {
  return (events ?? []).filter((event) => event.date > now).sort((a, b) => a.date - b.date)
}
