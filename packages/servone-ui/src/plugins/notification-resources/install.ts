import core, { getCurrentAccount } from '@hcengineering/core'
import type { DocNotifyContext, InboxNotification } from '@hcengineering/notification'
import { setMetadata, type Metadata } from '@hcengineering/platform'
import { classify } from '@servone/notify-rules'

const INBOX_NOTIFICATION_FILTER = 'servone:metadata:InboxNotificationFilter' as Metadata<
(inboxNotification: InboxNotification, context: DocNotifyContext | undefined) => boolean
>

const COMMON_INBOX_NOTIFICATION = 'notification:class:CommonInboxNotification'

function isOwnOrSystemChange (inboxNotification: InboxNotification): boolean {
  if (inboxNotification._class === COMMON_INBOX_NOTIFICATION && !('header' in inboxNotification)) return false
  const author = inboxNotification.createdBy
  if (author === undefined) return false
  return author === core.account.System || getCurrentAccount().socialIds.includes(author)
}

export function installNotifyLevelFilter (): void {
  setMetadata(
    INBOX_NOTIFICATION_FILTER,
    (inboxNotification, context) => !isOwnOrSystemChange(inboxNotification) && classify(inboxNotification, context) === 'surface'
  )
}

installNotifyLevelFilter()
