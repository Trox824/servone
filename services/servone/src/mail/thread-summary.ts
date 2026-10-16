import { emailsOf, type MailMessageCard, type MailThreadFields } from '@servone/mail'

export type ThreadSummary = Pick<MailThreadFields,
'mailLastMessageAt' | 'mailSnippet' | 'mailParticipants' | 'mailFolders' | 'mailHasUnread' | 'mailIsStarred' | 'mailHasAttachments' | 'mailMessageCount'>

export function summarizeThread (messages: MailMessageCard[]): ThreadSummary {
  const newest = messages.reduce((latest, message) => (message.mailSentAt > latest.mailSentAt ? message : latest))
  return {
    mailLastMessageAt: newest.mailSentAt,
    mailSnippet: newest.mailSnippet,
    mailParticipants: emailsOf(messages.flatMap((message) => [message.mailFrom, ...message.mailTo, ...message.mailCc])),
    mailFolders: [...new Set(messages.flatMap((message) => message.mailFolders))],
    mailHasUnread: messages.some((message) => !message.mailIsRead && !message.mailIsDraft),
    mailIsStarred: messages.some((message) => message.mailIsStarred),
    mailHasAttachments: messages.some((message) => message.mailHasAttachments),
    mailMessageCount: messages.length
  }
}
