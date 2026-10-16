import type { Ref } from '@hcengineering/core'
import { MAIL_APP_ALIAS, type MailThreadCard } from '@servone/mail'

export function newArrivals (
  previous: ReadonlyMap<Ref<MailThreadCard>, number>,
  threads: MailThreadCard[]
): MailThreadCard[] {
  return threads.filter((thread) => thread.mailHasUnread && (previous.get(thread._id) ?? -Infinity) < thread.mailLastMessageAt)
}

export function isMailOpen (path: string[]): boolean {
  return path[2] === MAIL_APP_ALIAS
}
