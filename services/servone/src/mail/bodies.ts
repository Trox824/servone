import { type MailFolderCard, type MailMessageCard, readLocation } from '@servone/mail'
import type { ImapFlow } from 'imapflow'
import { type ParsedMail, simpleParser } from 'mailparser'
import { types } from 'util'
import type { BlobStore } from './blobs'
import type { MailCards } from './cards'
import type { MailboxSync } from './sync'

export const SNIPPET_LENGTH = 200

export function makeSnippet (text: string): string {
  const unquoted = text.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('>')).join(' ')
  return unquoted.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH)
}

export class BodyFetcher {
  constructor (
    private readonly sync: MailboxSync,
    private readonly imap: ImapFlow,
    private readonly cards: MailCards,
    private readonly blobs: BlobStore
  ) {}

  async fetchPending (limit: number): Promise<number> {
    const pending = await this.cards.findMessages({ mailBodyBlob: '', mailRawBlob: '', mailIsDraft: false }, { limit, isNewestFirst: true })
    for (const message of pending) await this.fetchOne(message)
    return pending.length
  }

  async fetchOne (message: MailMessageCard): Promise<void> {
    // A moved message has no location until the target folder is polled; retry it then.
    const [first] = message.mailLocations
    const location = first === undefined ? undefined : readLocation(first)
    if (location === undefined) return
    const [folder] = await this.cards.findFolders({ _id: location.folder })
    if (folder === undefined) return
    const source = await this.sync.run(async () => await this.download(folder, location.uid))
    if (source === undefined) return

    let parsed: ParsedMail
    try {
      parsed = await simpleParser(source)
    } catch (error: unknown) {
      // isNativeError: mailparser can surface Node-core buffer/stream errors on malformed MIME, so instanceof would miss them under jest's VM realm.
      if (!types.isNativeError(error)) throw error
      // The UI shows "Tải bản gốc" for a message with only a raw blob, so a MIME we cannot parse stays readable.
      // Only a parse failure lands here: blob/card writes below run outside this try so a storage or DB
      // error propagates and leaves the message pending (mailBodyBlob and mailRawBlob both '') for retry.
      const rawBlob = await this.blobs.put(source, 'message/rfc822')
      await this.cards.updateMessage(message._id, { mailRawBlob: rawBlob, mailSnippet: '' })
      return
    }

    const html = parsed.html !== false ? parsed.html : parsed.textAsHtml ?? ''
    const bodyBlob = await this.blobs.put(Buffer.from(html, 'utf8'), 'text/html')
    for (const part of parsed.attachments) {
      if (part.contentDisposition !== 'attachment' && part.filename === undefined) continue
      const blob = await this.blobs.put(part.content, part.contentType)
      await this.cards.attachFile(message._id, { name: part.filename ?? 'tệp đính kèm', blob, size: part.size, contentType: part.contentType })
    }
    // mailparser only fills .text from a text/plain part or a multipart/alternative html node; a lone
    // html part in multipart/mixed (e.g. HTML body + attachment) leaves .text undefined, so fall back to stripping tags.
    const snippetSource = parsed.text ?? html.replace(/<[^>]+>/g, ' ')
    await this.cards.updateMessage(message._id, { mailBodyBlob: bodyBlob, mailSnippet: makeSnippet(snippetSource) })
    await this.sync.refreshThread(message.mailThread)
  }

  private async download (folder: MailFolderCard, uid: number): Promise<Buffer | undefined> {
    const lock = await this.imap.getMailboxLock(folder.mailPath)
    try {
      const fetched = await this.imap.fetchOne(String(uid), { source: true }, { uid: true })
      return fetched === false ? undefined : fetched.source
    } finally {
      lock.release()
    }
  }
}
