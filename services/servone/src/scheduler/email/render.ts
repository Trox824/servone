import type { DigestLocale } from '@servone/notify-rules'

import type { DigestConversation } from '../digest'
import { digestStrings, PAGE_LOCALES, pageStrings } from './templates'

export function escapeHtml (text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface LinkedConversation extends DigestConversation {
  url: string
}

export interface DigestEmailInput {
  locale: DigestLocale
  workspaceName: string
  total: number
  conversations: LinkedConversation[]
  inboxUrl: string
  unsubscribeUrl: string
}

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

const STYLE = {
  body: 'margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2328',
  card: 'max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px',
  heading: 'margin:0 0 16px;font-size:18px',
  title: 'margin:20px 0 6px;font-size:15px',
  link: 'color:#1f6feb;text-decoration:none',
  line: 'margin:0 0 4px;font-size:14px;line-height:1.5',
  muted: 'margin:0 0 4px;font-size:13px;color:#656d76',
  footer: 'margin:24px 0 0;font-size:12px;color:#656d76'
}

function renderConversationHtml (conversation: LinkedConversation, locale: DigestLocale): string {
  const strings = digestStrings[locale]
  const lines = conversation.lines
    .map(
      (line) => `<p style="${STYLE.line}"><strong>${escapeHtml(line.sender)}:</strong> ${escapeHtml(line.snippet)}</p>`
    )
    .join('')
  const more =
    conversation.moreCount > 0
      ? `<p style="${STYLE.muted}">${escapeHtml(strings.more(conversation.moreCount))}</p>`
      : ''
  return (
    `<h2 style="${STYLE.title}"><a style="${STYLE.link}" href="${escapeHtml(conversation.url)}">` +
    `${escapeHtml(conversation.title)}</a></h2>${lines}${more}`
  )
}

function renderConversationText (conversation: LinkedConversation, locale: DigestLocale): string {
  const strings = digestStrings[locale]
  const lines = conversation.lines.map((line) => `  ${line.sender}: ${line.snippet}`)
  if (conversation.moreCount > 0) lines.push(`  ${strings.more(conversation.moreCount)}`)
  return [conversation.title, ...lines, `  ${conversation.url}`].join('\n')
}

export function renderDigest (input: DigestEmailInput): RenderedEmail {
  const strings = digestStrings[input.locale]
  const subject = strings.subject(input.total, input.workspaceName)
  const text = [
    subject,
    '',
    ...input.conversations.map((conversation) => renderConversationText(conversation, input.locale) + '\n'),
    `${strings.open}: ${input.inboxUrl}`,
    '',
    `${strings.footer} ${strings.turnOff}: ${input.unsubscribeUrl}`
  ].join('\n')
  const html =
    `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>` +
    `<body style="${STYLE.body}"><div style="${STYLE.card}">` +
    `<h1 style="${STYLE.heading}">${escapeHtml(subject)}</h1>` +
    input.conversations.map((conversation) => renderConversationHtml(conversation, input.locale)).join('') +
    `<p style="${STYLE.title}"><a style="${STYLE.link}" href="${escapeHtml(input.inboxUrl)}">${escapeHtml(strings.open)}</a></p>` +
    `<p style="${STYLE.footer}">${escapeHtml(strings.footer)} ` +
    `<a style="${STYLE.link}" href="${escapeHtml(input.unsubscribeUrl)}">${escapeHtml(strings.turnOff)}</a></p>` +
    '</div></body></html>'
  return { subject, text, html }
}

export type UnsubscribePage =
  | { kind: 'confirm', workspaceName: string, actionUrl: string }
  | { kind: 'done', workspaceName: string }
  | { kind: 'invalid' }
  | { kind: 'failed' }

function pageMessage (page: UnsubscribePage, locale: DigestLocale): string {
  const strings = pageStrings[locale]
  switch (page.kind) {
    case 'confirm':
      return strings.confirm(page.workspaceName)
    case 'done':
      return strings.done(page.workspaceName)
    case 'invalid':
      return strings.invalid
    case 'failed':
      return strings.failed
  }
}

export function renderUnsubscribePage (page: UnsubscribePage): string {
  const title = PAGE_LOCALES.map((locale) => pageStrings[locale].title).join(' / ')
  const messages = PAGE_LOCALES.map(
    (locale) => `<p lang="${locale}" style="${STYLE.line}">${escapeHtml(pageMessage(page, locale))}</p>`
  ).join('')
  const form =
    page.kind === 'confirm'
      ? `<form method="post" action="${escapeHtml(page.actionUrl)}" style="margin-top:16px">` +
        '<button type="submit" style="padding:8px 16px;font-size:14px;border-radius:6px;border:1px solid #1f6feb;' +
        'background:#1f6feb;color:#ffffff;cursor:pointer">' +
        escapeHtml(PAGE_LOCALES.map((locale) => pageStrings[locale].button).join(' / ')) +
        '</button></form>'
      : ''
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>` +
    `<body style="${STYLE.body}"><div style="${STYLE.card}"><h1 style="${STYLE.heading}">${escapeHtml(title)}</h1>` +
    `${messages}${form}</div></body></html>`
  )
}
