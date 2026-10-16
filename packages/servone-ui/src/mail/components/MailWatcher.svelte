<!--
  Mounted once from NavFooter, outside MailApp's own context, so it can toast new mail while the user
  is anywhere else in Servone. No markup: it only runs the inbox-unread query and shows a toast.
-->
<script lang="ts">
  import { getCurrentAccount, SortingOrder, type Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { location } from '@hcengineering/ui'
  import {
    MAIL_ACCOUNT_CLASS,
    MAIL_FOLDER_CLASS,
    MAIL_THREAD_CLASS,
    mailboxSpaceId,
    type MailFolderCard,
    type MailThreadCard
  } from '@servone/mail'
  import { folderByRole } from '../lib/folders'
  import { participantsLine } from '../lib/format'
  import { hasGoogleLogin, isGmailPromptDeclined } from '../lib/gmail-prompt'
  import { isMailOpen, newArrivals } from '../lib/new-mail'
  import { showConnectGmailToast, showNewMailToast } from '../lib/toasts'
  import { text } from '../plugin'

  const INBOX_WATCH_LIMIT = 20 // task-17 brief: cap the unread-inbox query at 20 threads

  const space = mailboxSpaceId(getCurrentAccount().uuid)

  let accountEmail = ''
  let inboxFolder: Ref<MailFolderCard> | undefined

  let seeded = false
  let lastMessageAt = new Map<Ref<MailThreadCard>, number>()

  const accountQuery = createQuery()
  accountQuery.query(MAIL_ACCOUNT_CLASS, { space }, (found) => {
    accountEmail = found[0]?.mailEmail ?? ''
    if (found.length === 0 && hasGoogleLogin(getCurrentAccount().socialIds) && !isGmailPromptDeclined()) showConnectGmailToast()
  })

  const folderQuery = createQuery()
  folderQuery.query(MAIL_FOLDER_CLASS, { space }, (found) => {
    inboxFolder = folderByRole([...found], 'inbox')?._id
  })

  const threadsQuery = createQuery()
  $: if (inboxFolder !== undefined) {
    threadsQuery.query(
      MAIL_THREAD_CLASS,
      { space, mailFolders: inboxFolder, mailHasUnread: true },
      (found) => { checkArrivals([...found]) },
      { limit: INBOX_WATCH_LIMIT, sort: { mailLastMessageAt: SortingOrder.Descending } }
    )
  }

  function checkArrivals (threads: MailThreadCard[]): void {
    const arrivals = seeded ? newArrivals(lastMessageAt, threads) : []
    lastMessageAt = new Map(threads.map((thread) => [thread._id, thread.mailLastMessageAt]))
    seeded = true
    if (isMailOpen($location.path)) return
    for (const thread of arrivals) {
      showNewMailToast(thread.title, participantsLine(thread.mailParticipants, accountEmail, text('Me')), thread._id)
    }
  }
</script>
