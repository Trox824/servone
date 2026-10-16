import type { MasterTag } from '@hcengineering/card'
import type { PersonId, Ref, Space } from '@hcengineering/core'
import type { MailFolderCard, MailMessageCard, MailThreadCard } from '@servone/mail'
import { isDestructive, threadActionTargets } from '../actions'

const MESSAGE_CLASS = 'servone:type:MailMessage' as Ref<MasterTag>

function message (id: string, folders: string[], overrides: Partial<MailMessageCard> = {}): MailMessageCard {
  return {
    _id: id as Ref<MailMessageCard>,
    _class: MESSAGE_CLASS,
    space: 'space1' as Ref<Space>,
    modifiedOn: 0,
    modifiedBy: 'user1' as PersonId,
    title: id,
    content: 'content1' as MailMessageCard['content'],
    blobs: {},
    parentInfo: [],
    rank: '0',
    mailThread: 'thread1' as Ref<MailThreadCard>,
    mailMessageId: `<${id}@x>`,
    mailInReplyTo: '',
    mailReferences: [],
    mailFrom: 'a@x.vn',
    mailTo: [],
    mailCc: [],
    mailBcc: [],
    mailSentAt: 0,
    mailSnippet: '',
    mailIsRead: true,
    mailIsStarred: false,
    mailIsDraft: false,
    mailLocations: [],
    mailFolders: folders.map((folder) => folder as Ref<MailFolderCard>),
    mailProviderMessageId: '',
    mailBodyBlob: '',
    mailRawBlob: '',
    mailHasAttachments: false,
    mailTargetFolder: null,
    mailIsDeleted: false,
    ...overrides
  }
}

describe('threadActionTargets', () => {
  it('archives only the messages that sit in the folder being viewed', () => {
    const inInbox = message('m1', ['inbox', 'label'])
    const labelOnly = message('m2', ['label'])
    const updates = threadActionTargets([inInbox, labelOnly], { kind: 'move', target: 'archive' as Ref<MailFolderCard> }, 'inbox' as Ref<MailFolderCard>)
    expect(updates).toEqual([{ message: inInbox, change: { mailTargetFolder: 'archive' } }])
  })

  it('marks read only messages that are unread, and never drafts', () => {
    const unread = message('m1', ['inbox'], { mailIsRead: false })
    const read = message('m2', ['inbox'], { mailIsRead: true })
    const draft = message('m3', ['drafts'], { mailIsRead: false, mailIsDraft: true })
    expect(
      threadActionTargets([unread, read, draft], { kind: 'read', isRead: true }, 'inbox' as Ref<MailFolderCard>).map((it) => it.message._id)
    ).toEqual(['m1'])
  })

  it('stars the latest message and unstars every starred one', () => {
    const older = message('m1', ['inbox'], { mailSentAt: 1, mailIsStarred: true })
    const latest = message('m2', ['inbox'], { mailSentAt: 2 })
    expect(
      threadActionTargets([older, latest], { kind: 'star', isStarred: true }, 'inbox' as Ref<MailFolderCard>).map((it) => it.message._id)
    ).toEqual(['m2'])
    expect(
      threadActionTargets([older, latest], { kind: 'star', isStarred: false }, 'inbox' as Ref<MailFolderCard>).map((it) => it.message._id)
    ).toEqual(['m1'])
  })

  it('yields no star target when the latest message is already starred', () => {
    const older = message('m1', ['inbox'], { mailSentAt: 1 })
    const latest = message('m2', ['inbox'], { mailSentAt: 2, mailIsStarred: true })
    expect(threadActionTargets([older, latest], { kind: 'star', isStarred: true }, 'inbox' as Ref<MailFolderCard>)).toEqual([])
  })

  it('deletes forever only messages sitting in the folder being emptied', () => {
    const inTrash = message('m1', ['trash'])
    const elsewhere = message('m2', ['inbox'])
    expect(
      threadActionTargets([inTrash, elsewhere], { kind: 'deleteForever' }, 'trash' as Ref<MailFolderCard>).map((it) => it.message._id)
    ).toEqual(['m1'])
  })
})

describe('isDestructive', () => {
  it('flags move and deleteForever as destructive, read and star as not', () => {
    expect(isDestructive({ kind: 'move', target: 'archive' as Ref<MailFolderCard> })).toBe(true)
    expect(isDestructive({ kind: 'deleteForever' })).toBe(true)
    expect(isDestructive({ kind: 'read', isRead: true })).toBe(false)
    expect(isDestructive({ kind: 'star', isStarred: true })).toBe(false)
  })
})
