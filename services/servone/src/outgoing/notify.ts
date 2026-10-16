import type { RestClient } from '@hcengineering/api-client'
import contact from '@hcengineering/contact'
import type { AccountUuid } from '@hcengineering/core'
import { findRecipient } from '../workspaces'
import type { AttemptRecord, OutgoingHook } from './store'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface DisabledEmail {
  subject: string
  text: string
}

export interface MailService {
  url: string
  authToken: string | undefined
}

const twoDigits = (part: number): string => String(part).padStart(2, '0')

function utcTime (time: number): string {
  const at = new Date(time)
  const day = `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`
  return `${day} ${twoDigits(at.getUTCHours())}:${twoDigits(at.getUTCMinutes())} UTC`
}

// `place` names the project or channel; `fixLine` says where to turn the hook back on.
export function disabledEmail (hook: OutgoingHook, last: AttemptRecord, place: string, fixLine: string): DisabledEmail {
  // The query string may carry the receiver's own token.
  const target = new URL(hook.url)
  const answer = last.error ?? String(last.status)
  return {
    subject: `Webhook turned off in ${place}`,
    text:
      `The webhook to ${target.origin}${target.pathname} failed ${hook.consecutiveFailures} times in a row and was ` +
      `turned off on ${utcTime(hook.disabledOn ?? last.at)}. Last answer: ${answer}.\n\n` +
      `${fixLine}\n`
  }
}

// Owners with a verified email; the hook's creator when no owner has one.
export async function disabledEmailRecipients (
  client: RestClient,
  owners: readonly AccountUuid[],
  createdBy: AccountUuid
): Promise<string[]> {
  for (const accounts of [owners, [createdBy]]) {
    if (accounts.length === 0) continue
    const persons = await client.findAll(contact.class.Person, { personUuid: { $in: [...accounts] } })
    const emails = await Promise.all(persons.map(async (person) => await findRecipient(client, person._id)))
    const found = emails.filter((email): email is string => email !== undefined)
    if (found.length > 0) return found
  }
  return []
}

export async function sendEmail (mail: MailService, to: string[], email: DisabledEmail): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (mail.authToken !== undefined) headers.Authorization = `Bearer ${mail.authToken}`
  const response = await fetch(`${mail.url}/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ to, subject: email.subject, text: email.text })
  })
  if (!response.ok) throw new Error(`Mail service answered ${response.status} ${response.statusText}`)
}
