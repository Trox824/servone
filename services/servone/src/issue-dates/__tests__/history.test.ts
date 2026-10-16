import core, { type Class, type Doc, type PersonId, type Ref, type Space, type Status, type TxCUD, TxFactory } from '@hcengineering/core'
import tracker, { type Issue } from '@hcengineering/tracker'
import type { StatusKind } from '../dates'
import { readStatusTx, statusHistories } from '../history'

const factory = new TxFactory('user' as PersonId)
const space = 'project' as Ref<Space>
const issue = 'issue-1' as Ref<Issue>
const kinds = new Map<string, StatusKind>([
  ['todo', 'todo'],
  ['progress', 'active'],
  ['done', 'done']
])
const kindOf = (status: Ref<Status>): StatusKind => kinds.get(status) ?? 'todo'

interface StatusDoc extends Doc {
  status: Ref<Status>
}
// Class<T> never uses T, so the Issue class can carry just the field under test.
const statusDocClass: Ref<Class<StatusDoc>> = tracker.class.Issue

function created (status: string, at: number): TxCUD<Doc> {
  return factory.createTxCreateDoc(statusDocClass, space, { status: status as Ref<Status> }, issue, at)
}

function moved (status: string, at: number): TxCUD<Doc> {
  return factory.createTxUpdateDoc(tracker.class.Issue, space, issue, { status: status as Ref<Status> }, false, at)
}

describe('readStatusTx', () => {
  it('reads the status of a created issue and of a status change', () => {
    expect(readStatusTx(created('todo', 10))).toEqual({ issue, status: 'todo', at: 10 })
    expect(readStatusTx(moved('done', 20))).toEqual({ issue, status: 'done', at: 20 })
  })

  it('ignores updates without a status and other classes', () => {
    expect(readStatusTx(factory.createTxUpdateDoc(tracker.class.Issue, space, issue, { title: 'x' }))).toBeUndefined()
    expect(
      readStatusTx(factory.createTxUpdateDoc(tracker.class.Milestone, space, 'm' as Ref<Doc>, { label: 'x' }))
    ).toBeUndefined()
    expect(readStatusTx(factory.createTxRemoveDoc(core.class.Space, space, space))).toBeUndefined()
  })
})

describe('statusHistories', () => {
  it('builds each issue history from its creation and status changes', () => {
    const histories = statusHistories([moved('progress', 20), created('todo', 10), moved('done', 30)], kindOf)
    expect(histories.get(issue)).toEqual({
      created: 10,
      initial: 'todo',
      changes: [
        { kind: 'active', at: 20 },
        { kind: 'done', at: 30 }
      ]
    })
  })

  it('unwraps collection txes of older workspaces', () => {
    const wrapped = { ...moved('done', 30), objectId: 'parent', tx: moved('done', 30) }
    const histories = statusHistories([created('todo', 10), wrapped], kindOf)
    expect(histories.get(issue)?.changes).toEqual([{ kind: 'done', at: 30 }])
  })

  it('leaves out issues without a creation tx', () => {
    expect(statusHistories([moved('done', 30)], kindOf).size).toBe(0)
  })
})
