import core, { type Ref, type Tx } from '@hcengineering/core'
import tracker, { IssuePriority, type Milestone } from '@hcengineering/tracker'
import { changedFields, issueAfter, issueBefore, pickEvent, readIssueChange, type TrackerEvent } from '../events'
import {
  addComment,
  AN,
  createIssue,
  factory,
  IN_PROGRESS,
  ISSUE,
  PROJECT,
  removeIssue,
  systemUpdate,
  TODO,
  updateIssue
} from './fixtures'

describe('readIssueChange', () => {
  it('reads an issue create', () => {
    const tx = createIssue({ assignee: AN })
    expect(readIssueChange(tx)).toEqual({ kind: 'created', tx, project: PROJECT, issue: ISSUE })
  })

  it('reads the tracked fields of an update', () => {
    const tx = updateIssue({ status: IN_PROGRESS, assignee: AN, estimation: 3 })
    expect(readIssueChange(tx)).toEqual({ kind: 'updated', tx, project: PROJECT, issue: ISSUE, fields: ['status', 'assignee'] })
  })

  it('reads an unassign as an assignee change', () => {
    expect(readIssueChange(updateIssue({ assignee: null }))).toMatchObject({ kind: 'updated', fields: ['assignee'] })
  })

  it('reads a remove', () => {
    const tx = removeIssue()
    expect(readIssueChange(tx)).toEqual({ kind: 'deleted', tx, project: PROJECT, issue: ISSUE })
  })

  it('reads a comment on an issue', () => {
    const tx = addComment('<p>hi</p>')
    expect(readIssueChange(tx)).toEqual({ kind: 'comment', tx, project: PROJECT, issue: ISSUE })
  })

  it.each([
    ['comment counter', systemUpdate({ $inc: { comments: 1 } })],
    ['reported time', systemUpdate({ reportedTime: 4 })],
    ['child info', systemUpdate({ childInfo: [] })],
    ['sub-issue counter', systemUpdate({ $inc: { subIssues: 1 } })]
  ])('ignores a %s update', (_name, tx) => {
    expect(readIssueChange(tx)).toBeUndefined()
  })

  it('ignores a thread reply', () => {
    expect(readIssueChange(addComment('<p>reply</p>', 'replies'))).toBeUndefined()
  })

  it('ignores a message on something other than an issue', () => {
    const tx = { ...addComment('<p>hi</p>'), attachedToClass: tracker.class.Milestone }
    expect(readIssueChange(tx)).toBeUndefined()
  })

  it('ignores other classes', () => {
    const tx = factory.createTxUpdateDoc(tracker.class.Milestone, PROJECT, 'm1' as Ref<Milestone>, { label: 'x' })
    expect(readIssueChange(tx)).toBeUndefined()
  })

  it('ignores txes that are not CUD', () => {
    const tx: Tx = { _id: 't' as Ref<Tx>, _class: core.class.Tx, space: core.space.Tx, objectSpace: PROJECT, modifiedBy: core.account.System, modifiedOn: 1 }
    expect(readIssueChange(tx)).toBeUndefined()
  })
})

describe('pickEvent', () => {
  const all: TrackerEvent[] = ['issue.created', 'issue.updated', 'issue.status_changed', 'issue.assigned', 'issue.deleted', 'comment.added']

  it.each<[string, Array<'status' | 'assignee' | 'title'>, TrackerEvent[], TrackerEvent | undefined]>([
    ['status to a hook with every event', ['status', 'assignee'], all, 'issue.status_changed'],
    ['status and assignee without status_changed', ['status', 'assignee'], ['issue.assigned', 'issue.updated'], 'issue.assigned'],
    ['status to a hook with only updated', ['status'], ['issue.updated'], 'issue.updated'],
    ['assignee to a hook with every event', ['assignee'], all, 'issue.assigned'],
    ['title to a hook with every event', ['title'], all, 'issue.updated'],
    ['title to a hook without updated', ['title'], ['issue.status_changed', 'issue.assigned'], undefined],
    ['status to a hook with only created', ['status'], ['issue.created'], undefined]
  ])('picks for %s', (_name, fields, subscribed, expected) => {
    expect(pickEvent('updated', fields, subscribed)).toBe(expected)
  })

  it.each<['created' | 'deleted' | 'comment', TrackerEvent]>([
    ['created', 'issue.created'],
    ['deleted', 'issue.deleted'],
    ['comment', 'comment.added']
  ])('maps %s to %s when subscribed', (kind, event) => {
    expect(pickEvent(kind, [], [event])).toBe(event)
    expect(pickEvent(kind, [], all.filter((name) => name !== event))).toBeUndefined()
  })
})

describe('issueBefore and issueAfter', () => {
  it('rebuilds the state before and after an update', () => {
    const create = createIssue()
    const first = updateIssue({ priority: IssuePriority.High }, 2_000)
    const event = updateIssue({ status: IN_PROGRESS }, 3_000)
    const later = updateIssue({ title: 'Later title' }, 3_000)
    const before = issueBefore([create, first, event, later], event._id)
    expect(before).toMatchObject({ status: TODO, priority: IssuePriority.High, title: 'Send tracker events' })
    if (before === undefined) throw new Error('not rebuilt')
    const after = issueAfter(before, event)
    expect(after).toMatchObject({ status: IN_PROGRESS, priority: IssuePriority.High, title: 'Send tracker events' })
    expect(before.status).toBe(TODO)
  })

  it('uses the whole history when the event tx is not in it yet', () => {
    const event = updateIssue({ status: IN_PROGRESS })
    expect(issueBefore([createIssue()], event._id)).toMatchObject({ status: TODO })
  })

  it('has no state without a create tx', () => {
    const event = updateIssue({ status: IN_PROGRESS })
    expect(issueBefore([updateIssue({ title: 'x' })], event._id)).toBeUndefined()
  })
})

describe('changedFields', () => {
  it('drops a field rewritten with the same value', () => {
    const before = issueBefore([createIssue()], 'none' as Ref<Tx>)
    if (before === undefined) throw new Error('not rebuilt')
    const tx = updateIssue({ status: TODO, title: 'New title', dueDate: null })
    expect(changedFields(before, issueAfter(before, tx), ['status', 'title', 'dueDate'])).toEqual(['title'])
  })

  it('keeps every field when the previous state is unknown', () => {
    const after = issueBefore([createIssue()], 'none' as Ref<Tx>)
    if (after === undefined) throw new Error('not rebuilt')
    expect(changedFields(undefined, after, ['status', 'title'])).toEqual(['status', 'title'])
  })
})
