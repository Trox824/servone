import { type Markup } from '@hcengineering/core'
import { jsonToMarkup, markBold, markLink, MarkupNodeType, nodeDoc, nodeParagraph, nodeText, type MarkupNode } from '@hcengineering/text-core'
import { REPLY_PREFIX, type MailMessageCard } from '@servone/mail'

const MAX_TITLE_LENGTH = 255

export interface TaskQuoteLabels { from: string, date: string, subject: string, openMail: string }

export function taskTitle (subject: string): string {
  return subject.replace(REPLY_PREFIX, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH)
}

function labelled (label: string, text: string): MarkupNode[] {
  if (text.trim() === '') return []
  return [nodeParagraph(markBold(nodeText(`${label}: `)), nodeText(text))]
}

export function taskDescription (
  message: Pick<MailMessageCard, 'mailFrom' | 'mailSentAt' | 'title' | 'mailSnippet'>,
  link: string,
  labels: TaskQuoteLabels,
  lang: string
): Markup {
  const sentAt = new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(message.mailSentAt)
  const bodyLines = message.mailSnippet.split('\n').filter((line) => line.trim() !== '')
  const quote: MarkupNode = {
    type: MarkupNodeType.blockquote,
    content: [
      ...labelled(labels.from, message.mailFrom),
      ...labelled(labels.date, sentAt),
      ...labelled(labels.subject, message.title),
      ...bodyLines.map((line) => nodeParagraph(nodeText(line)))
    ]
  }
  return jsonToMarkup(nodeDoc(quote, nodeParagraph(markLink({ href: link, title: labels.openMail }, nodeText(labels.openMail)))))
}
