import type { Issue } from '@hcengineering/tracker'
import { generateId, type Ref } from '@hcengineering/core'
import type { MailMessageCard, MailThreadCard } from '@servone/mail'
import { MAIL_MESSAGE_CLASS, mailboxSpaceId } from '@servone/mail'
import type { Json } from '../http-json'
import type { WorkspaceSession } from '../mcp/types'
import { createIssue, type CreatedIssue } from '../tracker/issues'
import type { Caller } from '../webhooks/auth'

const MAIL_TIME_ZONE = 'Asia/Ho_Chi_Minh' // the product's customers; the task is read later by teammates in the same office
// Tracker issue titles are single-line; longer subjects are cut, the quote keeps the full subject.
const MAX_TITLE_LENGTH = 255

export interface TaskRequest { message: Ref<MailMessageCard>, project: string, title: string }

export function parseTaskRequest (json: Json): TaskRequest | { error: 'invalid_task' } {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return { error: 'invalid_task' }
  const { message, project, title } = json
  if (typeof message !== 'string' || message === '' || typeof project !== 'string' || project === '') return { error: 'invalid_task' }
  if (typeof title !== 'string' || title.trim() === '') return { error: 'invalid_task' }
  // The only cast: Ref<T> is a branded string, so the boundary parse still needs one assertion.
  return { message: message as Ref<MailMessageCard>, project, title: title.trim().slice(0, MAX_TITLE_LENGTH) }
}

// path[3] is read by the Mail app's thread route (Task 11/17); an unresolved workspace falls back to the workbench root.
export function mailTaskLink (frontUrl: string, workspaceUrl: string | undefined, thread: Ref<MailThreadCard>): string {
  return workspaceUrl === undefined ? `${frontUrl}/workbench` : `${frontUrl}/workbench/${workspaceUrl}/mail/${thread}`
}

function formatSentAt (sentAt: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: MAIL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(sentAt)
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((it) => it.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

// mailFrom/title/mailSnippet come from the email (From, Subject, body) and are attacker-controlled; escaping every
// markdown-active character keeps the quote inert text, never a live link/image/autolink/raw-HTML node.
const MARKDOWN_METACHARACTERS = /[\\`*_{}[\]()#+\-.!|<>~]/g

function escapeMarkdown (text: string): string {
  return text.replace(MARKDOWN_METACHARACTERS, '\\$&')
}

export function quoteForTask (message: Pick<MailMessageCard, 'mailFrom' | 'mailSentAt' | 'title' | 'mailSnippet'>, link: string): string {
  const body = message.mailSnippet.split('\n').map((line) => `> ${escapeMarkdown(line)}`)
  return [
    `> **Từ:** ${escapeMarkdown(message.mailFrom)}`,
    `> **Ngày:** ${formatSentAt(message.mailSentAt)}`,
    `> **Chủ đề:** ${escapeMarkdown(message.title)}`,
    '>',
    ...body,
    '',
    `[Mở thư](${link})`
  ].join('\n')
}

export async function createTaskFromMail (session: WorkspaceSession, message: MailMessageCard, request: TaskRequest, link: string): Promise<CreatedIssue> {
  return await createIssue(session, {
    project: request.project,
    title: request.title,
    description: quoteForTask(message, link),
    relations: [{ _id: message._id, _class: MAIL_MESSAGE_CLASS }]
  }, generateId<Issue>())
}

// Isolated from index.ts so the mailbox-space scoping (a message outside the caller's own mailbox is not_found)
// is unit-testable without stubbing the whole MailHttpDeps.createTask surface.
export async function createTaskForCaller (
  session: WorkspaceSession,
  caller: Pick<Caller, 'account'>,
  workspaceUrl: string | undefined,
  frontUrl: string,
  request: TaskRequest
): Promise<{ issue: string, identifier: string } | { error: 'not_found' | 'invalid_message' }> {
  const message = await session.client.findOne(MAIL_MESSAGE_CLASS, {
    _id: request.message,
    space: mailboxSpaceId(caller.account)
  })
  if (message === undefined) return { error: 'not_found' }
  // A draft has no sender/date/thread history worth quoting, and it can be deleted out from under the task on send.
  if (message.mailIsDraft) return { error: 'invalid_message' }
  const link = mailTaskLink(frontUrl, workspaceUrl, message.mailThread)
  const issue = await createTaskFromMail(session, message, request, link)
  return { issue: issue._id, identifier: issue.identifier }
}
