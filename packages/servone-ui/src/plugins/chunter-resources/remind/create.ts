import type { ChatMessage } from '@hcengineering/chunter'
import { getCurrentEmployee, getName } from '@hcengineering/contact'
import { getPersonByPersonId } from '@hcengineering/contact-resources'
import { generateId, getCurrentAccount, type Timestamp } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import { stripTags } from '@hcengineering/text'

import { calendarSpace, eventClass, type ReminderEvent } from '../../../lib/remind/reminder-event'

const TITLE_TEXT_LIMIT = 80
const DURATION_MS = 15 * 60_000

async function reminderTitle (message: ChatMessage): Promise<string> {
  const author = message.createdBy !== undefined ? await getPersonByPersonId(message.createdBy) : null
  const text = stripTags(message.message, TITLE_TEXT_LIMIT).trim()
  return author !== null ? `${getName(getClient().getHierarchy(), author)}: ${text}` : text
}

export async function createMessageReminder (message: ChatMessage, at: Timestamp): Promise<void> {
  const account = getCurrentAccount()
  await getClient().createDoc(eventClass, calendarSpace, {
    calendar: `${account.uuid}_calendar` as ReminderEvent['calendar'],
    eventId: generateId(),
    attachedTo: message._id,
    attachedToClass: message._class,
    collection: 'events',
    title: await reminderTitle(message),
    description: '',
    date: at,
    dueDate: at + DURATION_MS,
    allDay: false,
    participants: [getCurrentEmployee()],
    reminders: [0],
    access: 'owner',
    blockTime: false,
    user: account.primarySocialId
  })
}

export async function cancelMessageReminder (event: ReminderEvent): Promise<void> {
  await getClient().remove(event)
}
