import chunter, { type Channel, type ChatMessage, type DirectMessage } from '@hcengineering/chunter'
import { type Doc, type Markup, type PersonId, type Ref, SortingOrder } from '@hcengineering/core'
import notification, { type DocNotifyContext, type InboxNotification } from '@hcengineering/notification'
import { markupToText } from '@hcengineering/text-core'
import tracker, { type Issue } from '@hcengineering/tracker'
import { z } from 'zod'

import { type AnyTool, capText, defineTool } from '../tool'
import type { WorkspaceSession } from '../types'
import { directTitles, formatTimestamp, oneLine } from './chat'
import { namesBySocialId } from './people'

const MAX_NOTIFICATIONS = 50

// Activity rows carry `attachedTo`, mention rows `mentionedIn`; both point at the message.
// messageHtml is the mention's own excerpt, used when the mention is not in a chat message.
interface InboxRow extends InboxNotification {
  attachedTo?: Ref<Doc>
  mentionedIn?: Ref<Doc>
  messageHtml?: Markup
}

// A thread reply's context is its parent message, so the conversation is found via objectSpace.
async function contextTitles (
  session: WorkspaceSession,
  contexts: DocNotifyContext[]
): Promise<Map<Ref<DocNotifyContext>, string>> {
  const candidates = [...new Set(contexts.flatMap((context) => [context.objectId, context.objectSpace]))]
  const [channels, directs, issues] = await Promise.all([
    session.client.findAll(chunter.class.Channel, { _id: { $in: candidates as Array<Ref<Channel>> } }),
    session.client.findAll(chunter.class.DirectMessage, { _id: { $in: candidates as Array<Ref<DirectMessage>> } }),
    session.client.findAll(tracker.class.Issue, { _id: { $in: candidates as Array<Ref<Issue>> } })
  ])
  const names = new Map<Ref<Doc>, string>(channels.map((channel) => [channel._id, `#${channel.name}`]))
  for (const [id, title] of await directTitles(session, directs)) names.set(id, title)
  for (const issue of issues) names.set(issue._id, `${issue.identifier} ${oneLine(issue.title)}`)

  const titles = new Map<Ref<DocNotifyContext>, string>()
  for (const context of contexts) {
    const own = names.get(context.objectId)
    const parent = names.get(context.objectSpace)
    const fallback = context.objectClass.slice(context.objectClass.lastIndexOf(':') + 1)
    titles.set(context._id, own ?? (parent === undefined ? fallback : `thread in ${parent}`))
  }
  return titles
}

const listUnread = defineTool({
  name: 'list_unread_notifications',
  title: 'List unread notifications',
  description:
    "List the current user's unread, non-archived inbox notifications, newest first. " +
    'One line per notification: "YYYY-MM-DD HH:mm  where  Sender: text" (UTC), where "where" is "#channel", ' +
    '"DM with Name", "thread in #channel", or an issue like "SRV-12 Title". ' +
    'The last line is "Showing X of TOTAL unread". Does not mark anything as read.',
  input: z.object({
    limit: z.number().int().min(1).max(MAX_NOTIFICATIONS).default(20)
  }),
  annotations: { readOnlyHint: true },
  run: async (session, { limit }) => {
    const found = await session.client.findAll(
      notification.class.InboxNotification,
      { user: session.account.uuid, isViewed: false, archived: false },
      { sort: { createdOn: SortingOrder.Descending }, limit, total: true }
    )
    if (found.length === 0) return 'No unread notifications'
    const rows: InboxRow[] = found
    const contexts = await session.client.findAll(notification.class.DocNotifyContext, {
      _id: { $in: [...new Set(rows.map((row) => row.docNotifyContext))] }
    })
    const messageIds = rows
      .map((row) => row.mentionedIn ?? row.attachedTo)
      .filter((id): id is Ref<Doc> => id !== undefined)
    const messages = await session.client.findAll(chunter.class.ChatMessage, {
      _id: { $in: messageIds as Array<Ref<ChatMessage>> }
    })
    const messageById = new Map<Ref<Doc>, ChatMessage>(messages.map((message) => [message._id, message]))
    const messageOf = (row: InboxRow): ChatMessage | undefined => {
      const id = row.mentionedIn ?? row.attachedTo
      return id === undefined ? undefined : messageById.get(id)
    }
    const senderOf = (row: InboxRow): PersonId | undefined => messageOf(row)?.createdBy ?? row.createdBy
    const senders = await namesBySocialId(session, [
      ...new Set(rows.map(senderOf).filter((id): id is PersonId => id !== undefined))
    ])
    const titles = await contextTitles(session, contexts)

    const lines = rows.map((row) => {
      const markup = messageOf(row)?.message ?? row.messageHtml
      const text = markup === undefined ? '' : oneLine(markupToText(markup))
      const senderId = senderOf(row)
      const sender = senderId === undefined ? undefined : senders.get(senderId)
      const who = sender === undefined ? '' : text === '' ? sender : `${sender}: `
      const time = formatTimestamp(row.createdOn ?? row.modifiedOn)
      const where = titles.get(row.docNotifyContext) ?? 'unknown'
      return `${time}  ${where}  ${who}${text}`.trimEnd()
    })
    lines.push(`Showing ${rows.length} of ${found.total} unread`)
    return capText(lines.join('\n'))
  }
})

export const inboxTools: AnyTool[] = [listUnread]
