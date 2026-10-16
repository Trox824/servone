import { showPopup, type PopupResult } from '@hcengineering/ui'
import type { MailAccountCard, MailMessageCard } from '@servone/mail'
import Composer from '../components/Composer.svelte'
import type { ComposeMode } from './compose'

export function openNewMail (account: MailAccountCard, lang: string): void {
  openComposerPopup(account, lang, 'new', undefined)
}

export function openComposerPopup (account: MailAccountCard, lang: string, mode: ComposeMode, draft: MailMessageCard | undefined): void {
  let popup: PopupResult | undefined
  popup = showPopup(
    Composer,
    {
      mode,
      parent: undefined,
      thread: draft?.mailThread,
      draft,
      docked: false,
      account,
      lang,
      onClose: () => popup?.close(),
      onReopen: (sent: MailMessageCard, sentMode: ComposeMode) => { openComposerPopup(account, lang, sentMode, sent) }
    },
    'center'
  )
}
