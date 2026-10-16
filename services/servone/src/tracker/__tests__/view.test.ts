import chunter, { type ChatMessage } from '@hcengineering/chunter'
import type { MarkupBlobRef, PersonId, Ref } from '@hcengineering/core'
import tags from '@hcengineering/tags'
import tracker, { type Issue } from '@hcengineering/tracker'

import { CollabTimeoutError } from '../../mcp/collab'
import { readComment, readIssue } from '../view'
import { BASE, type ChatMessageRow, issueIn, issueRow, labelRow, rowsOf, setup, TAG_BUG } from './fixture'

const OCT_1_NOON = Date.UTC(2026, 9, 1, 12)

function commentRow (id: string, text: string, createdOn: number): ChatMessageRow {
  return {
    ...BASE,
    _id: id as Ref<ChatMessage>,
    _class: chunter.class.ChatMessage,
    attachedTo: 'i-12' as Ref<Issue>,
    createdBy: 'social-an' as PersonId,
    modifiedBy: 'social-an' as PersonId,
    createdOn,
    message: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
  }
}

describe('readIssue', () => {
  it('collects every field the API returns', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12, { description: 'blob-1' as MarkupBlobRef, dueDate: OCT_1_NOON }))
    rowsOf(f.tables, tags.class.TagReference).push(labelRow('i-12' as Ref<Issue>, TAG_BUG, 'Bug'))
    rowsOf(f.tables, chunter.class.ChatMessage).push(
      commentRow('c2', 'Second', Date.UTC(2026, 8, 27, 9)),
      commentRow('c1', 'First', Date.UTC(2026, 8, 27, 8))
    )
    const view = await readIssue(f.session, await issueIn(f, 12))
    expect(view).toMatchObject({
      identifier: 'SRV-12',
      project: 'SRV',
      title: 'Issue 12',
      description: 'Body **text**',
      status: 'In Progress',
      priority: 'high',
      assignee: { name: 'An Tran', email: 'an@servone.vn' },
      labels: ['Bug'],
      dueDate: OCT_1_NOON,
      createdOn: Date.UTC(2026, 8, 27, 8, 15),
      modifiedOn: 0
    })
    expect(view.comments.map((comment) => [comment.id, comment.author])).toEqual([
      ['c1', 'An Tran'],
      ['c2', 'An Tran']
    ])
  })

  it('reports no assignee and an empty description without calling the editor', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12, { assignee: null }))
    const view = await readIssue(f.session, await issueIn(f, 12))
    expect([view.assignee, view.description, view.labels, view.dueDate]).toEqual([null, '', [], null])
    expect(f.readMarkdown).not.toHaveBeenCalled()
  })

  it('lets an editor timeout through', async () => {
    const f = setup()
    rowsOf(f.tables, tracker.class.Issue).push(issueRow(12, { description: 'blob-1' as MarkupBlobRef }))
    f.readMarkdown.mockRejectedValue(new CollabTimeoutError())
    await expect(readIssue(f.session, await issueIn(f, 12))).rejects.toBeInstanceOf(CollabTimeoutError)
  })
})

describe('readComment', () => {
  it('returns the comment with its author', async () => {
    const f = setup()
    rowsOf(f.tables, chunter.class.ChatMessage).push(commentRow('c1', 'First', Date.UTC(2026, 8, 27, 8)))
    expect(await readComment(f.session, 'c1' as Ref<ChatMessage>)).toMatchObject({
      id: 'c1',
      author: 'An Tran',
      createdOn: Date.UTC(2026, 8, 27, 8)
    })
    expect(await readComment(f.session, 'c9' as Ref<ChatMessage>)).toBeUndefined()
  })
})
