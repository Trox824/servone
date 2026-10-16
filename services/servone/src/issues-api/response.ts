// The only place that decides the wire shape of issues and comments.
import type { Markup } from '@hcengineering/core'
import { markupToJSON } from '@hcengineering/text-core'
import { markupToMarkdown } from '@hcengineering/text-markdown'
import type { Json } from '@servone/config'

import type { CommentView, IssueView } from '../tracker/view'

function isoOf (at: number): string {
  return new Date(at).toISOString()
}

function markdownOf (message: Markup): string {
  return markupToMarkdown(markupToJSON(message)).trim()
}

export function issueJson (view: IssueView): Json {
  return {
    identifier: view.identifier,
    project: view.project,
    title: view.title,
    description: view.description,
    status: view.status,
    priority: view.priority,
    assignee: view.assignee === null ? null : { name: view.assignee.name, email: view.assignee.email },
    labels: view.labels,
    dueDate: view.dueDate === null ? null : isoOf(view.dueDate).slice(0, 10),
    createdOn: isoOf(view.createdOn),
    modifiedOn: isoOf(view.modifiedOn),
    comments: view.comments.map((comment) => ({
      author: comment.author,
      createdOn: isoOf(comment.createdOn),
      text: markdownOf(comment.message)
    }))
  }
}

export function commentJson (comment: CommentView, issue: string): Json {
  return {
    id: comment.id,
    issue,
    author: comment.author,
    createdOn: isoOf(comment.createdOn),
    text: markdownOf(comment.message)
  }
}
