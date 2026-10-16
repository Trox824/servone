import type { ActivityMessage } from '@hcengineering/activity'
import attachment, { type Attachment } from '@hcengineering/attachment'
import chunter, { type ChatMessage, type ThreadMessage } from '@hcengineering/chunter'
import type { Class, Doc, Hierarchy, Markup, Ref, TxOperations } from '@hcengineering/core'
import { jsonToMarkup, MarkupNodeType } from '@hcengineering/text-core'
import tracker, { type Issue, type Project } from '@hcengineering/tracker'

import { issueCopy } from './strings'

const PROJECT_KEY_PREFIX = 'servone.createIssue.project.'

export type WriteClient = Pick<TxOperations, 'addCollection'>
export type CreatedIssue = Pick<Issue, '_id' | 'space' | 'identifier' | 'title'>

export interface Conversation {
  _id: Ref<Doc>
  _class: Ref<Class<Doc>>
}

function isThreadReply (message: ChatMessage): message is ThreadMessage {
  return message._class === chunter.class.ThreadMessage
}

export function conversationOf (message: ChatMessage): Conversation {
  return isThreadReply(message)
    ? { _id: message.objectId, _class: message.objectClass }
    : { _id: message.attachedTo, _class: message.attachedToClass }
}

export function canCreateIssueFrom (hierarchy: Pick<Hierarchy, 'isDerived'>, message: ChatMessage): boolean {
  return hierarchy.isDerived(conversationOf(message)._class, chunter.class.ChunterSpace)
}

export async function copyAttachments (
  client: WriteClient,
  attachments: Attachment[],
  issue: CreatedIssue
): Promise<number> {
  const copies = await Promise.allSettled(
    attachments.map(
      async (source) =>
        await client.addCollection(attachment.class.Attachment, issue.space, issue._id, tracker.class.Issue, 'attachments', {
          name: source.name,
          file: source.file,
          type: source.type,
          size: source.size,
          lastModified: source.lastModified,
          metadata: source.metadata
        })
    )
  )
  return copies.filter((copy) => copy.status === 'rejected').length
}

export function issueReplyMarkup (issue: CreatedIssue): Markup {
  return jsonToMarkup({
    type: MarkupNodeType.doc,
    content: [
      {
        type: MarkupNodeType.paragraph,
        content: [
          { type: MarkupNodeType.text, text: `${issueCopy.Created} ` },
          {
            type: MarkupNodeType.reference,
            attrs: { id: issue._id, objectclass: tracker.class.Issue, label: issue.identifier }
          },
          { type: MarkupNodeType.text, text: ` ${issue.title}` }
        ]
      }
    ]
  })
}

export async function postIssueReply (client: WriteClient, message: ChatMessage, issue: CreatedIssue): Promise<void> {
  const conversation = conversationOf(message)
  const rootId: Ref<ActivityMessage> = isThreadReply(message) ? message.attachedTo : message._id
  const rootClass: Ref<Class<ActivityMessage>> = isThreadReply(message) ? message.attachedToClass : message._class
  await client.addCollection<ActivityMessage, ThreadMessage>(
    chunter.class.ThreadMessage,
    message.space,
    rootId,
    rootClass,
    'replies',
    {
      message: issueReplyMarkup(issue),
      attachments: 0,
      objectId: conversation._id,
      objectClass: conversation._class
    }
  )
}

export function lastProjectFor (channel: Ref<Doc>): Ref<Project> | undefined {
  const stored = localStorage.getItem(PROJECT_KEY_PREFIX + channel)
  return stored === null || stored === '' ? undefined : (stored as Ref<Project>)
}

export function rememberProject (channel: Ref<Doc>, project: Ref<Project>): void {
  localStorage.setItem(PROJECT_KEY_PREFIX + channel, project)
}
