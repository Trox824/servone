import type { Ref } from '@hcengineering/core'
import {
  emailsOf, encodeLocation, findThread, foldersOf, type IncomingMessage, type MailAccountCard, type MailFolderCard,
  type MailMessageCard, type MailThreadCard, parseLocation, subjectKey, type ThreadLookup
} from '@servone/mail'
import type { MailCards } from './cards'
import { summarizeThread } from './thread-summary'

// Enough candidates for a subject fallback; more than this with one normalized subject in 30 days is a mailing list.
const SUBJECT_CANDIDATES = 20

export interface FetchedMessage {
  folder: Ref<MailFolderCard>
  uid: number
  messageId: string
  inReplyTo: string
  references: string[]
  subject: string
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  sentAt: number
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  hasAttachments: boolean
  providerMessageId: string
  providerThreadId: string
}

function incomingOf (fetched: FetchedMessage): IncomingMessage {
  return {
    messageId: fetched.messageId,
    inReplyTo: fetched.inReplyTo,
    references: fetched.references,
    subject: fetched.subject,
    sentAt: fetched.sentAt,
    participants: emailsOf([fetched.from, ...fetched.to, ...fetched.cc]),
    providerThreadId: fetched.providerThreadId
  }
}

export class MailStore {
  private readonly dirtyThreads = new Set<Ref<MailThreadCard>>()
  // Backfill writes faster than the thread cards are re-read, so replies found in the same run resolve here; cleared on every flush so it never outlives a removed thread.
  private readonly threadByMessageId = new Map<string, Ref<MailThreadCard>>()

  private readonly lookup: ThreadLookup = {
    byProviderThreadId: async (id) => (await this.cards.findThreads({ mailProviderThreadId: id }, 1))[0]?._id,
    byMessageIds: async (ids) => {
      const cached = ids.map((id) => this.threadByMessageId.get(id)).find((thread) => thread !== undefined)
      if (cached !== undefined) return cached
      return (await this.cards.findMessages({ mailMessageId: { $in: ids } }, { limit: 1 }))[0]?.mailThread
    },
    bySubjectKey: async (key, since) =>
      (await this.cards.findThreads({ mailSubjectKey: key, mailLastMessageAt: { $gte: since } }, SUBJECT_CANDIDATES))
        .map((thread) => ({ thread: thread._id, participants: thread.mailParticipants }))
  }

  constructor (private readonly cards: MailCards, private readonly account: Ref<MailAccountCard>) {}

  async upsertMessage (fetched: FetchedMessage): Promise<Ref<MailMessageCard>> {
    const location = encodeLocation({ uid: fetched.uid, folder: fetched.folder })
    const existing = await this.findExisting(fetched, location)
    if (existing !== undefined) {
      const locations = existing.mailLocations.includes(location) ? existing.mailLocations : [...existing.mailLocations, location]
      await this.cards.updateMessage(existing._id, {
        mailLocations: locations, mailFolders: foldersOf(locations), mailIsRead: fetched.isRead, mailIsStarred: fetched.isStarred
      })
      this.dirtyThreads.add(existing.mailThread)
      return existing._id
    }
    const thread = (await findThread(incomingOf(fetched), this.lookup)) ?? (await this.createThread(fetched))
    const id = await this.cards.createMessage(fetched.subject, {
      mailThread: thread,
      mailMessageId: fetched.messageId,
      mailInReplyTo: fetched.inReplyTo,
      mailReferences: fetched.references,
      mailFrom: fetched.from,
      mailTo: fetched.to,
      mailCc: fetched.cc,
      mailBcc: fetched.bcc,
      mailSentAt: fetched.sentAt,
      mailSnippet: '',
      mailIsRead: fetched.isRead,
      mailIsStarred: fetched.isStarred,
      mailIsDraft: fetched.isDraft,
      mailLocations: [location],
      mailFolders: [fetched.folder],
      mailProviderMessageId: fetched.providerMessageId,
      mailBodyBlob: '',
      mailRawBlob: '',
      mailHasAttachments: fetched.hasAttachments,
      mailTargetFolder: null,
      mailIsDeleted: false
    })
    if (fetched.messageId !== '') this.threadByMessageId.set(fetched.messageId, thread)
    this.dirtyThreads.add(thread)
    return id
  }

  async updateFlags (folder: Ref<MailFolderCard>, uid: number, flags: { isRead: boolean, isStarred: boolean }): Promise<void> {
    const [message] = await this.cards.findMessages({ mailLocations: encodeLocation({ uid, folder }) }, { limit: 1 })
    if (message === undefined) return
    if (message.mailIsRead === flags.isRead && message.mailIsStarred === flags.isStarred) return
    await this.cards.updateMessage(message._id, { mailIsRead: flags.isRead, mailIsStarred: flags.isStarred })
    this.dirtyThreads.add(message.mailThread)
  }

  async removeLocation (folder: Ref<MailFolderCard>, uid: number): Promise<void> {
    const location = encodeLocation({ uid, folder })
    for (const message of await this.cards.findMessages({ mailLocations: location })) {
      const locations = message.mailLocations.filter((it) => it !== location)
      if (locations.length === 0) await this.cards.removeMessage(message._id)
      else await this.cards.updateMessage(message._id, { mailLocations: locations, mailFolders: foldersOf(locations) })
      this.dirtyThreads.add(message.mailThread)
    }
  }

  async uidsIn (folder: Ref<MailFolderCard>): Promise<Set<number>> {
    const uids = new Set<number>()
    for (const message of await this.cards.findMessages({ mailFolders: folder })) {
      for (const text of message.mailLocations) {
        const location = parseLocation(text)
        if (location.folder === folder) uids.add(location.uid)
      }
    }
    return uids
  }

  // After UIDVALIDITY changes every stored UID for the folder is meaningless.
  async forgetFolder (folder: Ref<MailFolderCard>): Promise<void> {
    for (const uid of await this.uidsIn(folder)) await this.removeLocation(folder, uid)
  }

  async flushThreadOf (thread: Ref<MailThreadCard>): Promise<void> {
    this.dirtyThreads.add(thread)
    await this.flushThreads()
  }

  async flushThreads (): Promise<void> {
    for (const thread of this.dirtyThreads) {
      const messages = await this.cards.findMessages({ mailThread: thread })
      if (messages.length === 0) await this.cards.removeThread(thread)
      else await this.cards.updateThread(thread, summarizeThread(messages))
    }
    this.dirtyThreads.clear()
    this.threadByMessageId.clear()
  }

  private async findExisting (fetched: FetchedMessage, location: string): Promise<MailMessageCard | undefined> {
    if (fetched.providerMessageId !== '') return (await this.cards.findMessages({ mailProviderMessageId: fetched.providerMessageId }, { limit: 1 }))[0]
    // Without a Message-ID only the exact folder+UID identifies the message; two such emails must stay two cards.
    if (fetched.messageId === '') return (await this.cards.findMessages({ mailLocations: location }, { limit: 1 }))[0]
    return (await this.cards.findMessages({ mailMessageId: fetched.messageId }, { limit: 1 }))[0]
  }

  private async createThread (fetched: FetchedMessage): Promise<Ref<MailThreadCard>> {
    return await this.cards.createThread(fetched.subject, {
      mailAccount: this.account,
      mailSubjectKey: subjectKey(fetched.subject),
      mailParticipants: incomingOf(fetched).participants,
      mailLastMessageAt: fetched.sentAt,
      mailSnippet: '',
      mailFolders: [fetched.folder],
      mailHasUnread: !fetched.isRead,
      mailIsStarred: fetched.isStarred,
      mailHasAttachments: fetched.hasAttachments,
      mailMessageCount: 1,
      mailProviderThreadId: fetched.providerThreadId
    })
  }
}
