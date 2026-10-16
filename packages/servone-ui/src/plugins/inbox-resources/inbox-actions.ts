import { SortingOrder } from '@hcengineering/core'
import { InboxNotificationsClientImpl, unReadNotifyContext } from '@hcengineering/notification-resources'
import type { IntlString } from '@hcengineering/platform'
import { getCommunicationClient, MessageBox } from '@hcengineering/presentation'
import { showPopup } from '@hcengineering/ui'
import { get } from 'svelte/store'
import inbox from './plugin'
import type { NavigationItem } from './type'

const CLEAR_CONFIRM = 'notification:string:ServoneClearAllConfirm' as IntlString

export async function readAllInbox (): Promise<void> {
  const communicationClient = getCommunicationClient()
  const contexts = await communicationClient.findNotificationContexts({ order: SortingOrder.Ascending })
  await Promise.all([
    ...contexts.map((context) => communicationClient.updateNotifications(context.id, {}, true)),
    InboxNotificationsClientImpl.getClient().readAllNotifications()
  ])
}

export async function clearAllInbox (): Promise<void> {
  const communicationClient = getCommunicationClient()
  const contexts = await communicationClient.findNotificationContexts({ order: SortingOrder.Ascending })
  await Promise.all([
    ...contexts.map((context) => communicationClient.removeNotificationContext(context.id)),
    InboxNotificationsClientImpl.getClient().removeAllNotifications()
  ])
}

export async function confirmClearInbox (clear: () => Promise<void>): Promise<void> {
  const contexts = await getCommunicationClient().findNotificationContexts({ order: SortingOrder.Ascending })
  const count = contexts.length + get(InboxNotificationsClientImpl.getClient().inboxNotificationsByContext).size
  showPopup(MessageBox, {
    label: inbox.string.ClearAll,
    message: CLEAR_CONFIRM,
    params: { count },
    dangerous: true,
    action: clear
  })
}

export async function setNavItemRead (navItem: NavigationItem, isRead: boolean): Promise<void> {
  if (navItem.type === 'modern') {
    await getCommunicationClient().updateNotifications(navItem.context.id, {}, isRead)
  } else if (isRead) {
    await InboxNotificationsClientImpl.getClient().readDoc(navItem._id)
  } else {
    await unReadNotifyContext(navItem.context)
  }
}
