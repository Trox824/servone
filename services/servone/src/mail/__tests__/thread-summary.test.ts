import type { Ref } from '@hcengineering/core'
import type { MailFolderCard, MailMessageCard } from '@servone/mail'
import { summarizeThread } from '../thread-summary'

const INBOX = 'inbox' as Ref<MailFolderCard>
const SENT = 'sent' as Ref<MailFolderCard>

function message (overrides: Partial<MailMessageCard>): MailMessageCard {
  return {
    mailFrom: 'Khách <khach@x.vn>', mailTo: ['linh@x.vn'], mailCc: [], mailSentAt: 1, mailSnippet: '', mailIsRead: true,
    mailIsStarred: false, mailIsDraft: false, mailHasAttachments: false, mailFolders: [INBOX], ...overrides
  } as MailMessageCard
}

describe('summarizeThread', () => {
  it('takes snippet and time from the newest message and unions the rest', () => {
    const summary = summarizeThread([
      message({ mailSentAt: 1, mailSnippet: 'old', mailIsRead: false }),
      message({ mailSentAt: 5, mailSnippet: 'new', mailFrom: 'linh@x.vn', mailTo: ['khach@x.vn'], mailFolders: [SENT], mailHasAttachments: true })
    ])
    expect(summary).toEqual({
      mailLastMessageAt: 5, mailSnippet: 'new', mailParticipants: ['khach@x.vn', 'linh@x.vn'], mailFolders: [INBOX, SENT],
      mailHasUnread: true, mailIsStarred: false, mailHasAttachments: true, mailMessageCount: 2
    })
  })

  it('does not count an unread draft as unread mail', () => {
    expect(summarizeThread([message({ mailIsRead: false, mailIsDraft: true })]).mailHasUnread).toBe(false)
  })
})
