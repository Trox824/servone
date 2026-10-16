import chunter from '@hcengineering/chunter'
import { type Doc } from '@hcengineering/core'
import { type DocNotifyContext } from '@hcengineering/notification'
import { InboxNotificationsClientImpl, readNotifyContext } from '@hcengineering/notification-resources'
import { getClient } from '@hcengineering/presentation'
import { getCurrentLocation, navigate, popupstore, showPopup } from '@hcengineering/ui'
import { get } from 'svelte/store'

import { navigateToSpecial } from '../navigation'
import { chatShortcut, nextRowIndex, type ChatShortcut } from './keys'
import QuickSwitcher from './QuickSwitcher.svelte'

const isMac = /Macintosh/i.test(navigator.userAgent)
const INBOX_ALIAS = 'inbox'

export function handleChatShortcut (event: KeyboardEvent, openedDoc: Doc | undefined): void {
  if (event.isComposing || get(popupstore).length > 0) return
  const shortcut = chatShortcut(event, isMac)
  if (shortcut === undefined) return
  event.preventDefault()
  void runShortcut(shortcut, openedDoc)
}

async function runShortcut (shortcut: ChatShortcut, openedDoc: Doc | undefined): Promise<void> {
  switch (shortcut) {
    case 'switcher':
      showPopup(QuickSwitcher, {}, 'top')
      return
    case 'directMessages':
      showPopup(QuickSwitcher, { isPeopleOnly: true }, 'top')
      return
    case 'previousChannel':
    case 'nextChannel':
    case 'previousUnread':
    case 'nextUnread':
      stepChannel(
        shortcut === 'nextChannel' || shortcut === 'nextUnread' ? 1 : -1,
        shortcut === 'previousUnread' || shortcut === 'nextUnread'
      )
      return
    case 'unreads':
      openInbox()
      return
    case 'threads':
      navigateToSpecial('threads')
      return
    case 'saved':
      navigateToSpecial('saved')
      return
    case 'markRead':
      await markRead(openedDoc)
      return
    case 'markAllRead':
      await markAllChatRead()
  }
}

function stepChannel (step: 1 | -1, isUnreadOnly: boolean): void {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-chat-nav-row]'))
  const index = nextRowIndex(
    rows.map((row) => ({
      isSelected: row.querySelector('button')?.dataset.selected === 'true',
      isUnread: row.dataset.unread === 'true'
    })),
    step,
    isUnreadOnly
  )
  if (index === undefined) return
  const button = rows[index].querySelector('button')
  button?.click()
  button?.scrollIntoView({ block: 'nearest' })
}

function openInbox (): void {
  const loc = getCurrentLocation()
  loc.path[2] = INBOX_ALIAS
  loc.path.length = 3
  loc.query = undefined
  loc.fragment = undefined
  navigate(loc)
}

async function markRead (openedDoc: Doc | undefined): Promise<void> {
  if (openedDoc === undefined) return
  const context = get(InboxNotificationsClientImpl.getClient().contextByDoc).get(openedDoc._id)
  if (context !== undefined && isUnread(context)) await readNotifyContext(context)
}

function isUnread (context: DocNotifyContext): boolean {
  if ((context.lastViewedTimestamp ?? 0) < (context.lastUpdateTimestamp ?? 0)) return true
  const notifications = get(InboxNotificationsClientImpl.getClient().inboxNotificationsByContext).get(context._id)
  return (notifications ?? []).some(({ isViewed }) => !isViewed)
}

async function markAllChatRead (): Promise<void> {
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const inboxClient = InboxNotificationsClientImpl.getClient()
  const notificationsByContext = get(inboxClient.inboxNotificationsByContext)
  const unreadContexts = get(inboxClient.contexts).filter(
    (context) => hierarchy.isDerived(context.objectClass, chunter.class.ChunterSpace) && isUnread(context)
  )
  if (unreadContexts.length === 0) return

  const ops = client.apply(undefined, 'servoneMarkChatRead', true)
  await inboxClient.readNotifications(
    ops,
    unreadContexts.flatMap((context) => (notificationsByContext.get(context._id) ?? []).map(({ _id }) => _id))
  )
  const now = Date.now()
  for (const context of unreadContexts) {
    await ops.update(context, { lastViewedTimestamp: now })
  }
  await ops.commit()
}
