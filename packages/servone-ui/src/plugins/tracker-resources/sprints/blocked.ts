import type { Ref, TxOperations } from '@hcengineering/core'
import { createQuery, getClient } from '@hcengineering/presentation'
import { SelectPopup, showPopup, type PopupAlignment } from '@hcengineering/ui'
import tracker, { type Issue } from '@hcengineering/tracker'
import { derived, readable, type Readable } from 'svelte/store'
import { statusKindOf } from './data'
import { blockedState, type BlockedState, type BlockerInfo, type Dependency } from './lib/blockers'
import { isOpen } from './lib/types'
import { str } from './plugin'

export interface IssueBrief extends BlockerInfo {
  identifier: string
  title: string
}

export interface Blocked extends BlockedState {
  issues: Map<string, IssueBrief>
}

const EMPTY: Blocked = { blockedBy: new Map(), blocking: new Map(), issues: new Map() }

export const blockedStore: Readable<Blocked> = readable<Blocked>(EMPTY, (set) => {
  const client = getClient()
  const withList = createQuery(true)
  const relations = createQuery(true)
  const briefs = createQuery(true)
  let listed: Dependency[] = []
  let gantt: Dependency[] = []
  let known = new Map<string, IssueBrief>()
  let wanted = ''

  function publish (): void {
    const deps = [...listed, ...gantt]
    const ids = [...new Set(deps.flatMap((d) => [d.from, d.to]))].sort()
    const key = ids.join(',')
    if (key !== wanted) {
      wanted = key
      if (ids.length === 0) {
        known = new Map()
        briefs.unsubscribe()
      } else {
        briefs.query(
          tracker.class.Issue,
          { _id: { $in: ids as Array<Ref<Issue>> } },
          (res) => {
            known = new Map(
              res.map((it) => [
                it._id as string,
                { _id: it._id, status: statusKindOf(client, it.status), identifier: it.identifier, title: it.title }
              ])
            )
            set({ ...blockedState(deps, known), issues: known })
          },
          { projection: { _id: 1, status: 1, identifier: 1, title: 1, space: 1 } }
        )
        return
      }
    }
    set({ ...blockedState(deps, known), issues: known })
  }

  withList.query(
    tracker.class.Issue,
    { blockedBy: { $exists: true } },
    (res) => {
      listed = res.flatMap((it) => (it.blockedBy ?? []).map((b) => ({ from: b._id as string, to: it._id as string })))
      publish()
    },
    { projection: { _id: 1, blockedBy: 1, space: 1 } }
  )
  relations.query(tracker.class.IssueRelation, { kind: 'finish-to-start' }, (res) => {
    gantt = res.map((r) => ({ from: r.attachedTo as string, to: r.target as string }))
    publish()
  })

  return () => {
    withList.unsubscribe()
    relations.unsubscribe()
    briefs.unsubscribe()
  }
})

export function blockersOf (b: Blocked, id: string): IssueBrief[] {
  return (b.blockedBy.get(id) ?? []).map((x) => b.issues.get(x) ?? { _id: x, status: 'todo', identifier: '?', title: '' })
}

export const blockedIds: Readable<Set<string>> = derived(blockedStore, (b) => new Set(b.blockedBy.keys()))

/** Toggles the issue's "Blocked by" list, the same field the issue page's Relations edit. */
export async function pickBlockers (client: TxOperations, issue: Issue, anchor: PopupAlignment | undefined): Promise<void> {
  const current = new Set((issue.blockedBy ?? []).map((b) => b._id as string))
  const all = await client.findAll(tracker.class.Issue, { space: issue.space }, { sort: { rank: 1 } })
  const value = all
    .filter((it) => it._id !== issue._id && (current.has(it._id) || isOpen(statusKindOf(client, it.status))))
    .map((it) => ({ id: it._id, text: `${it.identifier} ${it.title}`, isSelected: current.has(it._id) }))
    .sort((a, b) => Number(b.isSelected) - Number(a.isSelected))
  showPopup(SelectPopup, { value, searchable: true, placeholder: str.BlockedBySearch, width: 'large' }, anchor, async (id?: Ref<Issue>) => {
    if (id == null) return
    const blocker = all.find((it) => it._id === id)
    if (blocker === undefined) return
    await client.update(
      issue,
      current.has(id)
        ? { $pull: { blockedBy: { _id: id } } }
        : { $push: { blockedBy: { _id: blocker._id, _class: blocker._class } } }
    )
  })
}
