import { addDays, DAY_MS, startOfDay } from './time'

export const NO_PARENT = 'tracker:ids:NoParent'

export interface NeedRequest {
  _id: string
  createdOn?: number
}

export interface NeedIssue {
  _id: string
  title: string
  dueDate: number | null
  space: string
  attachedTo: string
}

export interface NeedInvite {
  _id: string
  date: number
}

export type Need<R extends NeedRequest, I extends NeedIssue, E extends NeedInvite> =
  | { kind: 'approval', doc: R, due: undefined }
  | { kind: 'step' | 'task', doc: I, due: number | undefined }
  | { kind: 'invite', doc: E, due: number }

export interface NeedsInput<R extends NeedRequest, I extends NeedIssue, E extends NeedInvite> {
  requests: R[]
  issues: I[]
  invites: E[]
  workflowSpaces: ReadonlySet<string>
  now: number
}

function rank (need: Need<NeedRequest, NeedIssue, NeedInvite>, today: number): [number, number] {
  if (need.kind === 'approval') return [1, need.doc.createdOn ?? 0]
  if (need.due === undefined) return [3, 0]
  return [need.due < today ? 0 : 2, need.due]
}

export function needsYou<R extends NeedRequest, I extends NeedIssue, E extends NeedInvite> (
  input: NeedsInput<R, I, E>
): Array<Need<R, I, E>> {
  const today = startOfDay(input.now)
  const tomorrow = addDays(today, 1)
  const needs: Array<Need<R, I, E>> = input.requests.map((doc) => ({ kind: 'approval', doc, due: undefined }))
  for (const doc of input.issues) {
    const due = doc.dueDate ?? undefined
    if (input.workflowSpaces.has(doc.space) && doc.attachedTo !== NO_PARENT) needs.push({ kind: 'step', doc, due })
    else if (due !== undefined && due < tomorrow) needs.push({ kind: 'task', doc, due })
  }
  for (const doc of input.invites) needs.push({ kind: 'invite', doc, due: doc.date })
  return needs.sort((a, b) => {
    const [groupA, keyA] = rank(a, today)
    const [groupB, keyB] = rank(b, today)
    return groupA - groupB || keyA - keyB || (a.kind === 'step' && b.kind === 'step' ? a.doc.title.localeCompare(b.doc.title) : 0)
  })
}

export type DueState = { kind: 'overdue', days: number } | { kind: 'today' | 'tomorrow' | 'later' | 'none' }

export function dueState (due: number | undefined, now: number): DueState {
  if (due === undefined) return { kind: 'none' }
  const today = startOfDay(now)
  if (due < today) return { kind: 'overdue', days: Math.round((today - startOfDay(due)) / DAY_MS) }
  if (due < addDays(today, 1)) return { kind: 'today' }
  if (due < addDays(today, 2)) return { kind: 'tomorrow' }
  return { kind: 'later' }
}
