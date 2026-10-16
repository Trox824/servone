import type { Ref } from '@hcengineering/core'
import type { MailFolderCard } from '@servone/mail'
import type { FetchMessageObject, ListResponse } from 'imapflow'
import { hasAttachmentPart, toFetchedMessage, toListedFolder } from '../imap'

const INBOX = 'inbox' as Ref<MailFolderCard>

function listed (path: string, specialUse: string, flags: string[] = []): ListResponse {
  return { path, name: path.split('/').pop() ?? path, delimiter: '/', flags: new Set(flags), specialUse, listed: true, subscribed: true, pathAsListed: path, parent: [], parentPath: '' } as ListResponse
}

describe('toListedFolder', () => {
  it('maps special-use folders to roles', () => {
    expect(toListedFolder(listed('INBOX', ''))?.role).toBe('inbox')
    expect(toListedFolder(listed('[Gmail]/Sent Mail', '\\Sent'))?.role).toBe('sent')
    expect(toListedFolder(listed('[Gmail]/All Mail', '\\All'))?.role).toBe('all')
    expect(toListedFolder(listed('Junk', '\\Junk'))?.role).toBe('spam')
    expect(toListedFolder(listed('Khách hàng', ''))?.role).toBe('other')
  })

  it('skips virtual and unselectable folders', () => {
    expect(toListedFolder(listed('[Gmail]', '', ['\\Noselect']))).toBeUndefined()
    expect(toListedFolder(listed('[Gmail]/Starred', '\\Flagged'))).toBeUndefined()
    expect(toListedFolder(listed('[Gmail]/Important', '\\Important'))).toBeUndefined()
  })
})

describe('toFetchedMessage', () => {
  it('maps envelope, flags, headers and Gmail ids', () => {
    const message = {
      seq: 1,
      uid: 42,
      flags: new Set(['\\Seen']),
      emailId: 'gm-msg',
      threadId: 'gm-thread',
      envelope: {
        date: new Date(5000),
        subject: 'Báo giá tháng 10',
        messageId: '<m2@x>',
        inReplyTo: '<m1@x>',
        from: [{ name: 'Nguyễn Linh', address: 'Linh@X.vn' }],
        to: [{ name: '', address: 'khach@x.vn' }],
        cc: [],
        bcc: []
      },
      headers: Buffer.from('References: <m0@x>\r\n <m1@x>\r\n\r\n'),
      internalDate: new Date(6000)
    } as FetchMessageObject
    expect(toFetchedMessage(message, INBOX)).toEqual({
      folder: INBOX, uid: 42, messageId: '<m2@x>', inReplyTo: '<m1@x>', references: ['<m0@x>', '<m1@x>'], subject: 'Báo giá tháng 10',
      from: 'Nguyễn Linh <linh@x.vn>', to: ['khach@x.vn'], cc: [], bcc: [], sentAt: 5000, isRead: true, isStarred: false, isDraft: false,
      hasAttachments: false, providerMessageId: 'gm-msg', providerThreadId: 'gm-thread'
    })
  })
})

describe('hasAttachmentPart', () => {
  it('finds a nested attachment', () => {
    expect(hasAttachmentPart({ type: 'multipart/mixed', childNodes: [{ type: 'text/plain' }, { type: 'application/pdf', disposition: 'attachment' }] })).toBe(true)
    expect(hasAttachmentPart({ type: 'multipart/alternative', childNodes: [{ type: 'text/plain' }, { type: 'text/html' }] })).toBe(false)
  })
})
