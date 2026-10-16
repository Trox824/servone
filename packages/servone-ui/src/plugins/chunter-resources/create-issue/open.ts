import attachment from '@hcengineering/attachment'
import chunter, { type ChatMessage } from '@hcengineering/chunter'
import { getName } from '@hcengineering/contact'
import { getPersonByPersonId } from '@hcengineering/contact-resources'
import type { Ref } from '@hcengineering/core'
import { translate, type IntlString } from '@hcengineering/platform'
import { getClient } from '@hcengineering/presentation'
import { markupToText } from '@hcengineering/text'
import tracker, { type Issue } from '@hcengineering/tracker'
import { addNotification, NotificationSeverity, showPopup, themeStore } from '@hcengineering/ui'
import { SimpleNotification } from '@hcengineering/view-resources'
import { get } from 'svelte/store'

import { getMessageLink } from '../navigation'
import { getChannelName } from '../utils'
import { webhookName } from '../webhooks/api'
import {
  conversationOf,
  copyAttachments,
  type CreatedIssue,
  lastProjectFor,
  postIssueReply,
  rememberProject
} from './create'
import { messageToDraft } from './draft'
import { createIssueUi } from './strings'

async function authorName (message: ChatMessage): Promise<string> {
  const hookName = webhookName(message)
  if (hookName !== undefined) return hookName
  const person = await getPersonByPersonId(message.createdBy ?? message.modifiedBy)
  return person !== null ? getName(getClient().getHierarchy(), person) : ''
}

async function showPartialFailure (title: IntlString, issue: CreatedIssue): Promise<void> {
  const text = await translate(title, {}, get(themeStore).language)
  addNotification(text, `${issue.identifier} ${issue.title}`, SimpleNotification, undefined, NotificationSeverity.Warning)
}

async function finishIssue (message: ChatMessage, issueId: Ref<Issue>): Promise<void> {
  const client = getClient()
  const issue = await client.findOne(tracker.class.Issue, { _id: issueId })
  if (issue === undefined) return
  rememberProject(conversationOf(message)._id, issue.space)
  const files =
    (message.attachments ?? 0) > 0 ? await client.findAll(attachment.class.Attachment, { attachedTo: message._id }) : []
  const failedCount = await copyAttachments(client, files, issue)
  if (failedCount > 0) await showPartialFailure(createIssueUi.FilesNotCopied, issue)
  try {
    await postIssueReply(client, message, issue)
  } catch (err) {
    await showPartialFailure(createIssueUi.ReplyNotPosted, issue)
    throw err
  }
}

export async function openCreateIssue (message: ChatMessage): Promise<void> {
  const client = getClient()
  const conversation = conversationOf(message)
  const language = get(themeStore).language
  const [channelName, author, link] = await Promise.all([
    getChannelName(conversation._id, conversation._class),
    authorName(message),
    getMessageLink(message)
  ])
  const isDirect = client.getHierarchy().isDerived(conversation._class, chunter.class.DirectMessage)
  const draft = messageToDraft({
    markup: message.message,
    isWebhook: webhookName(message) !== undefined,
    origin: { kind: isDirect ? 'direct' : 'channel', name: channelName ?? '' },
    author,
    sentAt: new Date(message.createdOn ?? message.modifiedOn).toLocaleString(language, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }),
    link
  })
  showPopup(
    tracker.component.CreateIssue,
    {
      space: lastProjectFor(conversation._id),
      relatedTo: message,
      initialTitle: draft.title,
      initialDescription: draft.description,
      servoneSource: { author, text: markupToText(message.message).replace(/\s+/g, ' ').trim() },
      shouldSaveDraft: false
    },
    'top',
    (issueId: Ref<Issue> | undefined) => {
      if (issueId !== undefined) void finishIssue(message, issueId)
    }
  )
}
