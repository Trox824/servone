import type { Ref } from '@hcengineering/core'
import type { MailAccountCard, MailFolderCard } from '@servone/mail'
import { type FetchedMessage, MailStore } from '../store'
import { FakeMailCards } from './fake-cards'

const INBOX = 'inbox' as Ref<MailFolderCard>
const WORK = 'work' as Ref<MailFolderCard>
const ACCOUNT = 'acc' as Ref<MailAccountCard>

function fetched (overrides: Partial<FetchedMessage>): FetchedMessage {
  return {
    folder: INBOX, uid: 1, messageId: '<m1@x>', inReplyTo: '', references: [], subject: 'Báo giá', from: 'Khách <khach@x.vn>',
    to: ['linh@x.vn'], cc: [], bcc: [], sentAt: 1000, isRead: false, isStarred: false, isDraft: false, hasAttachments: false,
    providerMessageId: '', providerThreadId: '', ...overrides
  }
}

describe('MailStore', () => {
  it('threads a reply with its original', async () => {
    const cards = new FakeMailCards()
    const store = new MailStore(cards, ACCOUNT)
    await store.upsertMessage(fetched({}))
    await store.upsertMessage(fetched({ uid: 2, messageId: '<m2@x>', inReplyTo: '<m1@x>', subject: 'Re: Báo giá', sentAt: 2000 }))
    await store.flushThreads()
    expect(cards.threads).toHaveLength(1)
    expect(cards.threads[0].mailMessageCount).toBe(2)
    expect(cards.threads[0].mailLastMessageAt).toBe(2000)
  })

  it('adds a second location instead of a second card', async () => {
    const cards = new FakeMailCards()
    const store = new MailStore(cards, ACCOUNT)
    await store.upsertMessage(fetched({}))
    await store.upsertMessage(fetched({ folder: WORK, uid: 7 }))
    expect(cards.messages).toHaveLength(1)
    expect(cards.messages[0].mailLocations).toEqual(['1@inbox', '7@work'])
    expect(cards.messages[0].mailFolders).toEqual([INBOX, WORK])
  })

  it('keeps messages without a Message-ID apart', async () => {
    const cards = new FakeMailCards()
    const store = new MailStore(cards, ACCOUNT)
    await store.upsertMessage(fetched({ messageId: '', subject: 'Một' }))
    await store.upsertMessage(fetched({ messageId: '', uid: 2, subject: 'Hai' }))
    expect(cards.messages).toHaveLength(2)
  })

  it('is idempotent for the same location', async () => {
    const cards = new FakeMailCards()
    const store = new MailStore(cards, ACCOUNT)
    await store.upsertMessage(fetched({ messageId: '' }))
    await store.upsertMessage(fetched({ messageId: '' }))
    expect(cards.messages).toHaveLength(1)
  })

  it('removes the card and its thread when the last location goes', async () => {
    const cards = new FakeMailCards()
    const store = new MailStore(cards, ACCOUNT)
    await store.upsertMessage(fetched({}))
    await store.flushThreads()
    await store.removeLocation(INBOX, 1)
    await store.flushThreads()
    expect(cards.messages).toHaveLength(0)
    expect(cards.threads).toHaveLength(0)
  })

  it('resolves a reply to a removed thread into a new thread', async () => {
    const cards = new FakeMailCards()
    const store = new MailStore(cards, ACCOUNT)
    await store.upsertMessage(fetched({}))
    await store.flushThreads()
    const removedThread = cards.threads[0]._id
    await store.removeLocation(INBOX, 1)
    await store.flushThreads()
    await store.upsertMessage(fetched({ uid: 2, messageId: '<m2@x>', inReplyTo: '<m1@x>', subject: 'Re: Báo giá', sentAt: 2000 }))
    await store.flushThreads()
    expect(cards.threads).toHaveLength(1)
    expect(cards.threads[0]._id).not.toBe(removedThread)
    for (const message of cards.messages) {
      expect(cards.threads.some((thread) => thread._id === message.mailThread)).toBe(true)
    }
  })

  it('matches on provider message id before Message-ID', async () => {
    const cards = new FakeMailCards()
    const store = new MailStore(cards, ACCOUNT)
    await store.upsertMessage(fetched({ providerMessageId: 'gm-1', messageId: '<a@x>' }))
    await store.upsertMessage(fetched({ folder: WORK, uid: 7, providerMessageId: 'gm-1', messageId: '<b@x>' }))
    expect(cards.messages).toHaveLength(1)
    expect(cards.messages[0].mailLocations).toEqual(['1@inbox', '7@work'])
  })

  it('updates flags found by location', async () => {
    const cards = new FakeMailCards()
    const store = new MailStore(cards, ACCOUNT)
    await store.upsertMessage(fetched({}))
    await store.updateFlags(INBOX, 1, { isRead: true, isStarred: true })
    expect(cards.messages[0]).toMatchObject({ mailIsRead: true, mailIsStarred: true })
  })

  it('lists the uids it holds for a folder', async () => {
    const cards = new FakeMailCards()
    const store = new MailStore(cards, ACCOUNT)
    await store.upsertMessage(fetched({}))
    await store.upsertMessage(fetched({ folder: WORK, uid: 7 }))
    expect([...(await store.uidsIn(WORK))]).toEqual([7])
  })
})
