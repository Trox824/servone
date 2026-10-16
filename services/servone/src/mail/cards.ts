import attachment, { type Attachment } from '@hcengineering/attachment'
import type { CardSpace } from '@hcengineering/card'
import core, { type Blob, type Doc, type DocumentQuery, type Ref, SortingOrder, TxFactory, type TxOperations } from '@hcengineering/core'
import {
  cardBase, MAIL_ACCOUNT_CLASS, MAIL_FOLDER_CLASS, MAIL_MESSAGE_CLASS, MAIL_THREAD_CLASS,
  type MailAccountCard, type MailAccountFields, type MailFolderCard, type MailFolderFields,
  type MailMessageCard, type MailMessageFields, type MailThreadCard, type MailThreadFields
} from '@servone/mail'

// A few thousand single removeDoc calls over REST took minutes; one apply per batch is one round trip.
export const REMOVE_BATCH = 200

export interface StoredFile {
  name: string
  blob: Ref<Blob>
  size: number
  contentType: string
}

export interface MailCards {
  findAccount: () => Promise<MailAccountCard | undefined>
  findFolders: (query: DocumentQuery<MailFolderCard>) => Promise<MailFolderCard[]>
  findThreads: (query: DocumentQuery<MailThreadCard>, limit?: number) => Promise<MailThreadCard[]>
  findMessages: (query: DocumentQuery<MailMessageCard>, options?: { limit?: number, isNewestFirst?: boolean }) => Promise<MailMessageCard[]>
  createAccount: (title: string, fields: MailAccountFields) => Promise<Ref<MailAccountCard>>
  createFolder: (title: string, fields: MailFolderFields) => Promise<Ref<MailFolderCard>>
  createThread: (title: string, fields: MailThreadFields) => Promise<Ref<MailThreadCard>>
  createMessage: (title: string, fields: MailMessageFields) => Promise<Ref<MailMessageCard>>
  updateAccount: (id: Ref<MailAccountCard>, patch: Partial<MailAccountFields>) => Promise<void>
  updateFolder: (id: Ref<MailFolderCard>, patch: Partial<MailFolderFields>) => Promise<void>
  updateThread: (id: Ref<MailThreadCard>, patch: Partial<MailThreadFields>) => Promise<void>
  updateMessage: (id: Ref<MailMessageCard>, patch: Partial<MailMessageFields>) => Promise<void>
  removeThread: (id: Ref<MailThreadCard>) => Promise<void>
  removeMessage: (id: Ref<MailMessageCard>) => Promise<void>
  removeFolder: (id: Ref<MailFolderCard>) => Promise<void>
  removeAll: (docs: Doc[]) => Promise<void>
  findAttachments: (limit: number) => Promise<Attachment[]>
  attachFile: (message: Ref<MailMessageCard>, file: StoredFile) => Promise<void>
  attachmentsOf: (message: Ref<MailMessageCard>) => Promise<StoredFile[]>
}

export function createMailCards (client: TxOperations, space: Ref<CardSpace>): MailCards {
  return {
    findAccount: async () => await client.findOne(MAIL_ACCOUNT_CLASS, { space }),
    findFolders: async (query) => await client.findAll(MAIL_FOLDER_CLASS, { ...query, space }),
    findThreads: async (query, limit) => await client.findAll(MAIL_THREAD_CLASS, { ...query, space }, { limit }),
    findMessages: async (query, options) =>
      await client.findAll(MAIL_MESSAGE_CLASS, { ...query, space }, {
        limit: options?.limit,
        sort: options?.isNewestFirst === true ? { mailSentAt: SortingOrder.Descending } : undefined
      }),
    createAccount: async (title, fields) => await client.createDoc(MAIL_ACCOUNT_CLASS, space, Object.assign(cardBase(title), fields)),
    createFolder: async (title, fields) => await client.createDoc(MAIL_FOLDER_CLASS, space, Object.assign(cardBase(title), fields)),
    createThread: async (title, fields) => await client.createDoc(MAIL_THREAD_CLASS, space, Object.assign(cardBase(title), fields)),
    createMessage: async (title, fields) => await client.createDoc(MAIL_MESSAGE_CLASS, space, Object.assign(cardBase(title), fields)),
    updateAccount: async (id, patch) => { await client.updateDoc(MAIL_ACCOUNT_CLASS, space, id, patch) },
    updateFolder: async (id, patch) => { await client.updateDoc(MAIL_FOLDER_CLASS, space, id, patch) },
    updateThread: async (id, patch) => { await client.updateDoc(MAIL_THREAD_CLASS, space, id, patch) },
    updateMessage: async (id, patch) => { await client.updateDoc(MAIL_MESSAGE_CLASS, space, id, patch) },
    removeThread: async (id) => { await client.removeDoc(MAIL_THREAD_CLASS, space, id) },
    removeMessage: async (id) => { await client.removeDoc(MAIL_MESSAGE_CLASS, space, id) },
    removeFolder: async (id) => { await client.removeDoc(MAIL_FOLDER_CLASS, space, id) },
    removeAll: async (docs) => {
      const factory = new TxFactory(core.account.System)
      for (let start = 0; start < docs.length; start += REMOVE_BATCH) {
        const removals = docs.slice(start, start + REMOVE_BATCH).map((doc) => factory.createTxRemoveDoc<Doc>(doc._class, space, doc._id))
        await client.tx(factory.createTxApplyIf(core.space.Tx, 'servone-mail-remove', [], [], removals, undefined))
      }
    },
    attachFile: async (message, file) => {
      await client.addCollection(attachment.class.Attachment, space, message, MAIL_MESSAGE_CLASS, 'attachments', {
        name: file.name, file: file.blob, size: file.size, type: file.contentType, lastModified: Date.now()
      })
    },
    findAttachments: async (limit) => await client.findAll(attachment.class.Attachment, { space }, { limit }),
    attachmentsOf: async (message) => {
      const found = await client.findAll(attachment.class.Attachment, { attachedTo: message, space })
      return found.map((doc) => ({ name: doc.name, blob: doc.file, size: doc.size, contentType: doc.type }))
    }
  }
}
