import type { ChatMessage } from '@hcengineering/chunter'
import type { Action } from '@hcengineering/ui'

import { formatRemindTime } from '../../../lib/remind/remind-time'
import type { ReminderEvent } from '../../../lib/remind/reminder-event'
import { cancelMessageReminder } from './create'
import { futureReminders } from './pending'
import RemindIcon from './RemindIcon.svelte'
import RemindPopup from './RemindPopup.svelte'
import { remindStrings } from './strings'

export function remindActions (
  message: ChatMessage,
  reminders: ReminderEvent[] | undefined,
  now: number,
  language: string | undefined
): Action[] {
  const remind: Action = {
    label: remindStrings.RemindMe,
    icon: RemindIcon,
    group: 'tools',
    component: RemindPopup,
    props: { message },
    action: async () => {}
  }
  const cancels: Action[] = futureReminders(reminders, now).map((event) => ({
    label: remindStrings.CancelReminder,
    labelParams: { time: formatRemindTime(event.date, now, language) },
    icon: RemindIcon,
    group: 'tools',
    action: async () => {
      await cancelMessageReminder(event)
    }
  }))
  return [remind, ...cancels]
}
