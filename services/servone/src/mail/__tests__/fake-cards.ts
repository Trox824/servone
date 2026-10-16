import { type Doc, type DocumentQuery, generateId, type Ref } from '@hcengineering/core'
import type {
  MailAccountCard, MailAccountFields, MailFolderCard, MailFolderFields, MailMessageCard, MailMessageFields, MailThreadCard, MailThreadFields
} from '@servone/mail'
import type { Attachment } from '@hcengineering/attachment'
import type { MailCards, StoredFile } from '../cards'
import { cardBase } from '../schema'

function valueMatches (actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
    const $in: unknown = Reflect.get(expected, '$in')
    if (Array.isArray($in)) return $in.some((candidate) => valueMatches(actual, candidate))
    const $gte: unknown = Reflect.get(expected, '$gte')
    if (typeof $gte === 'number') return typeof actual === 'number' && actual >= $gte
  }
  if (Array.isArray(actual) && !Array.isArray(expected)) return actual.includes(expected)
  return actual === expected
}

export function matches<T extends Doc> (doc: T, query: DocumentQuery<T>): boolean {
  return Object.entries(query).every(([key, expected]) => valueMatches(Reflect.get(doc, key), expected))
}

function stamp<T> (title: string, fields: T): T & ReturnType<typeof cardBase> & Doc {
  return Object.assign(cardBase(title), fields, { _id: generateId(), _class: 'fake', space: 'fake', modifiedOn: Date.now(), modifiedBy: 'fake' }) as T & ReturnType<typeof cardBase> & Doc
}

export class FakeMailCards implements MailCards {
  accounts: MailAccountCard[] = []
  folders: MailFolderCard[] = []
  threads: MailThreadCard[] = []
  messages: MailMessageCard[] = []
  files: Array<{ message: Ref<MailMessageCard>, file: StoredFile }> = []

  async findAccount (): Promise<MailAccountCard | undefined> { return this.accounts[0] }
  async findFolders (query: DocumentQuery<MailFolderCard>): Promise<MailFolderCard[]> { return this.folders.filter((doc) => matches(doc, query)) }
  async findThreads (query: DocumentQuery<MailThreadCard>, limit?: number): Promise<MailThreadCard[]> {
    return this.threads.filter((doc) => matches(doc, query)).slice(0, limit)
  }

  async findMessages (query: DocumentQuery<MailMessageCard>, options?: { limit?: number, isNewestFirst?: boolean }): Promise<MailMessageCard[]> {
    const found = this.messages.filter((doc) => matches(doc, query))
    if (options?.isNewestFirst === true) found.sort((a, b) => b.mailSentAt - a.mailSentAt)
    return found.slice(0, options?.limit)
  }

  async createAccount (title: string, fields: MailAccountFields): Promise<Ref<MailAccountCard>> { const card: MailAccountCard = stamp(title, fields); this.accounts.push(card); return card._id }
  async createFolder (title: string, fields: MailFolderFields): Promise<Ref<MailFolderCard>> { const card: MailFolderCard = stamp(title, fields); this.folders.push(card); return card._id }
  async createThread (title: string, fields: MailThreadFields): Promise<Ref<MailThreadCard>> { const card: MailThreadCard = stamp(title, fields); this.threads.push(card); return card._id }
  async createMessage (title: string, fields: MailMessageFields): Promise<Ref<MailMessageCard>> { const card: MailMessageCard = stamp(title, fields); this.messages.push(card); return card._id }

  async updateAccount (id: Ref<MailAccountCard>, patch: Partial<MailAccountFields>): Promise<void> { Object.assign(this.accounts.find((doc) => doc._id === id) ?? {}, patch) }
  async updateFolder (id: Ref<MailFolderCard>, patch: Partial<MailFolderFields>): Promise<void> { Object.assign(this.folders.find((doc) => doc._id === id) ?? {}, patch) }
  async updateThread (id: Ref<MailThreadCard>, patch: Partial<MailThreadFields>): Promise<void> { Object.assign(this.threads.find((doc) => doc._id === id) ?? {}, patch) }
  async updateMessage (id: Ref<MailMessageCard>, patch: Partial<MailMessageFields>): Promise<void> { Object.assign(this.messages.find((doc) => doc._id === id) ?? {}, patch) }

  async removeThread (id: Ref<MailThreadCard>): Promise<void> { this.threads = this.threads.filter((doc) => doc._id !== id) }
  async removeMessage (id: Ref<MailMessageCard>): Promise<void> { this.messages = this.messages.filter((doc) => doc._id !== id) }
  async removeFolder (id: Ref<MailFolderCard>): Promise<void> { this.folders = this.folders.filter((doc) => doc._id !== id) }
  attachments: Attachment[] = []
  async findAttachments (limit: number): Promise<Attachment[]> { return this.attachments.slice(0, limit) }
  async removeAll (docs: Doc[]): Promise<void> {
    const ids = new Set<string>(docs.map((doc) => doc._id))
    this.attachments = this.attachments.filter((doc) => !ids.has(doc._id))
    this.accounts = this.accounts.filter((doc) => !ids.has(doc._id))
    this.folders = this.folders.filter((doc) => !ids.has(doc._id))
    this.threads = this.threads.filter((doc) => !ids.has(doc._id))
    this.messages = this.messages.filter((doc) => !ids.has(doc._id))
  }
  async attachFile (message: Ref<MailMessageCard>, file: StoredFile): Promise<void> { this.files.push({ message, file }) }
  async attachmentsOf (message: Ref<MailMessageCard>): Promise<StoredFile[]> { return this.files.filter((entry) => entry.message === message).map((entry) => entry.file) }
}
