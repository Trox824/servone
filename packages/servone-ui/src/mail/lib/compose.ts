import type { MailMessageCard } from '@servone/mail'
import { parseAddress, REPLY_PREFIX } from '@servone/mail'
import { prepareMailHtml } from './html'

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export interface ComposeSeed {
  to: string[]
  cc: string[]
  subject: string
  inReplyTo: string
  references: string[]
  quoteHtml: string
}

export function replySubject (subject: string): string {
  return REPLY_PREFIX.test(subject) ? subject : `Re: ${subject}`
}

export function forwardSubject (subject: string): string {
  return REPLY_PREFIX.test(subject) ? subject : `Fwd: ${subject}`
}

export function parseAddressList (text: string): string[] {
  return text.split(/[,;\n]/).map((entry) => entry.trim()).filter((entry) => entry !== '')
}

function isMe (address: string, me: string): boolean {
  return parseAddress(address).email === parseAddress(me).email
}

function dedupeAddresses (addresses: string[]): string[] {
  const seenEmails = new Set<string>()
  const deduped: string[] = []
  for (const address of addresses) {
    const email = parseAddress(address).email
    if (seenEmails.has(email)) continue
    seenEmails.add(email)
    deduped.push(address)
  }
  return deduped
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function escapeHtml (text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
}

function quoteHeader (parent: MailMessageCard, lang: string): string {
  const date = escapeHtml(new Date(parent.mailSentAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US'))
  const from = escapeHtml(parent.mailFrom)
  return lang === 'vi' ? `Vào ${date}, ${from} đã viết:` : `On ${date}, ${from} wrote:`
}

export function quotableHtml (html: string): string {
  const { srcdoc } = prepareMailHtml(html, false)
  const doc = new DOMParser().parseFromString(srcdoc, 'text/html')
  doc.body.querySelectorAll('style').forEach((el) => { el.remove() })
  return doc.body.innerHTML.trim()
}

function quoteFor (parent: MailMessageCard, parentHtml: string, lang: string): string {
  const body = quotableHtml(parentHtml)
  if (body === '') return ''
  return `<blockquote>${quoteHeader(parent, lang)}<br>${body}</blockquote>`
}

const EMPTY_SEED: ComposeSeed = { to: [], cc: [], subject: '', inReplyTo: '', references: [], quoteHtml: '' }

export function seedFor (mode: ComposeMode, parent: MailMessageCard | undefined, parentHtml: string, me: string, lang: string): ComposeSeed {
  if (mode === 'new' || parent === undefined) return EMPTY_SEED

  if (mode === 'forward') {
    return { ...EMPTY_SEED, subject: forwardSubject(parent.title), quoteHtml: quoteFor(parent, parentHtml, lang) }
  }

  const notMe = (address: string): boolean => !isMe(address, me)

  const to = mode === 'replyAll'
    ? dedupeAddresses([parent.mailFrom, ...parent.mailTo].filter(notMe))
    : (isMe(parent.mailFrom, me) ? dedupeAddresses(parent.mailTo.filter(notMe)) : [parent.mailFrom])

  const toEmails = new Set(to.map((address) => parseAddress(address).email))
  const cc = mode === 'replyAll'
    ? dedupeAddresses(parent.mailCc.filter((address) => notMe(address) && !toEmails.has(parseAddress(address).email)))
    : []

  return {
    to,
    cc,
    subject: replySubject(parent.title),
    inReplyTo: parent.mailMessageId,
    references: [...parent.mailReferences, parent.mailMessageId],
    quoteHtml: quoteFor(parent, parentHtml, lang)
  }
}
