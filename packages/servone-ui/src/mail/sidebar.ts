import type { CardSpace } from '@hcengineering/card'
import type { AccountUuid, Client, Ref } from '@hcengineering/core'
import workbench from '@hcengineering/workbench'
import { MAIL_APP_ALIAS, mailboxSpaceId } from '@servone/mail'
import { MailApiError, setupMailApp } from './api'

const BADGE_CAP = 99

let hasTried = false

export function shouldInstallMailApp (hasApp: boolean, alreadyTried: boolean): boolean {
  return !hasApp && !alreadyTried
}

export async function ensureMailApp (client: Client): Promise<void> {
  const hasApp = client.getModel().findAllSync(workbench.class.Application, { alias: MAIL_APP_ALIAS }).length > 0
  if (!shouldInstallMailApp(hasApp, hasTried)) return
  try {
    await setupMailApp()
    hasTried = true
  } catch (error) {
    if (error instanceof MailApiError && error.code === 'not_configured') {
      hasTried = true
      return
    }
    throw error
  }
}

export function inboxUnreadQuery (account: AccountUuid): { space: Ref<CardSpace>, mailRole: 'inbox' } {
  return { space: mailboxSpaceId(account), mailRole: 'inbox' }
}

export function badgeText (unread: number): string {
  if (unread <= 0) return ''
  return unread > BADGE_CAP ? `${BADGE_CAP}+` : String(unread)
}
