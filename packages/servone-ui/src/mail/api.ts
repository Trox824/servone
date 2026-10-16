import type { Ref } from '@hcengineering/core'
import { getMetadata } from '@hcengineering/platform'
import presentation from '@hcengineering/presentation'
import type { MailMessageCard, ProviderId, ServerEndpoint } from '@servone/mail'
import { isObject, servoneServiceUrl, type Json } from '../plugins/chunter-resources/webhooks/api'

export class MailApiError extends Error {
  constructor (readonly status: number, readonly code: string) {
    super(`mail api ${status} ${code}`)
  }
}

export type LoginCheck = { isOk: true } | { isOk: false, reason: 'auth' | 'network' | 'tls' | 'host_refused', detail: string }

export interface ConnectForm {
  provider: ProviderId
  email: string
  password: string
  username?: string
  imap?: ServerEndpoint
  smtp?: ServerEndpoint
}

const REASONS = ['auth', 'network', 'tls', 'host_refused'] as const

export function parseLoginCheck (json: Json): LoginCheck {
  if (!isObject(json) || typeof json.isOk !== 'boolean') throw new MailApiError(200, 'bad_response')
  if (json.isOk) return { isOk: true }
  const reason = REASONS.find((it) => it === json.reason) ?? 'network'
  return { isOk: false, reason, detail: typeof json.detail === 'string' ? json.detail : '' }
}

async function call (path: string, body: Json): Promise<Json> {
  const base = await servoneServiceUrl('SERVONE_MCP_URL')
  if (base === undefined) throw new MailApiError(0, 'not_configured')
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getMetadata(presentation.metadata.Token) ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const json = (await response.json()) as Json
  if (!response.ok) throw new MailApiError(response.status, isObject(json) && typeof json.error === 'string' ? json.error : 'unknown')
  return json
}

function formBody (form: ConnectForm): Json {
  const body: Record<string, Json> = { provider: form.provider, email: form.email, password: form.password }
  if (form.username !== undefined) body.username = form.username
  if (form.imap !== undefined) body.imap = { ...form.imap }
  if (form.smtp !== undefined) body.smtp = { ...form.smtp }
  return body
}

export async function setupMailApp (): Promise<void> {
  await call('/mail/setup', {})
}

export async function connectAt (
  path: '/mail/connect' | '/mail/reconnect',
  form: ConnectForm
): Promise<LoginCheck | { isOk: true, account: string }> {
  const json = await call(path, formBody(form))
  if (isObject(json) && typeof json.account === 'string') return { isOk: true, account: json.account }
  return parseLoginCheck(json)
}

export async function disconnectMailbox (shouldDeleteMail: boolean): Promise<void> {
  await call('/mail/disconnect', { deleteMail: shouldDeleteMail })
}

export async function googleConsentUrl (): Promise<string> {
  const json = await call('/mail/oauth/start', {})
  if (!isObject(json) || typeof json.url !== 'string') throw new MailApiError(200, 'bad_response')
  return json.url
}

export async function sendDraft (draft: Ref<MailMessageCard>): Promise<void> {
  await call('/mail/send', { draft })
}

export async function saveDraftToProvider (draft: Ref<MailMessageCard>): Promise<void> {
  await call('/mail/draft', { draft })
}

export async function fetchBodyNow (message: Ref<MailMessageCard>): Promise<void> {
  await call('/mail/body', { message })
}
