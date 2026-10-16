import type { Person } from '@hcengineering/contact'
import core, { type PersonId, type Ref, type Status, type Timestamp, type Tx } from '@hcengineering/core'
import task from '@hcengineering/task'
import type { ApproverRule } from '@servone/approvals/src/gate'
import { CATEGORIES } from '@servone/config'

export const ACTIVE_REQUEST = 'Active' // RequestStatus.Active
const COMPLETED = 'Completed' // RequestStatus.Completed

export type StageState = 'done' | 'skipped' | 'current' | 'upcoming'

export type GateState =
  | { kind: 'ahead' }
  | { kind: 'waiting', approver: Ref<Person> | undefined }
  | { kind: 'approved', approver: Ref<Person> | undefined, on: Timestamp }
  | { kind: 'missing' }

export interface StageInput extends Pick<Status, '_id' | 'name' | 'category'> {
  approval?: ApproverRule
}

export interface Stage {
  status: Ref<Status>
  name: string
  state: StageState
  approval?: ApproverRule
  gate?: GateState
}

export interface StageTrack {
  stages: Stage[]
  lost?: { status: Ref<Status>, name: string }
}

export interface StatusMove {
  status: Ref<Status>
  by: PersonId
  on: Timestamp
}

export interface GateRequest {
  servoneGate?: Ref<Status>
  status: string
  modifiedOn: Timestamp
  requested: Array<Ref<Person>>
  approved: Array<Ref<Person>>
  approvedDates?: Timestamp[]
}

export interface ItemHistory {
  moves: StatusMove[]
  requests: GateRequest[]
}

export interface StatusTx extends Pick<Tx, '_class' | 'modifiedBy' | 'modifiedOn'> {
  attributes?: { status?: Ref<Status> }
  operations?: { status?: Ref<Status> }
}

export function statusMoves (txes: StatusTx[]): StatusMove[] {
  const moves: StatusMove[] = []
  for (const tx of txes) {
    let status: Ref<Status> | undefined
    if (tx._class === core.class.TxCreateDoc) status = tx.attributes?.status
    if (tx._class === core.class.TxUpdateDoc) status = tx.operations?.status
    if (status === undefined || moves[moves.length - 1]?.status === status) continue
    moves.push({ status, by: tx.modifiedBy, on: tx.modifiedOn })
  }
  return moves
}

function gateState (state: StageState, gate: Ref<Status>, requests: GateRequest[]): GateState {
  const forGate = requests.filter((request) => request.servoneGate === gate)
  if (state === 'upcoming') return { kind: 'ahead' }
  if (state === 'current') {
    return { kind: 'waiting', approver: forGate.find((request) => request.status === ACTIVE_REQUEST)?.requested[0] }
  }
  const approval = forGate.filter((request) => request.status === COMPLETED).pop()
  if (approval === undefined) return { kind: 'missing' }
  return { kind: 'approved', approver: approval.approved[0], on: approval.approvedDates?.[0] ?? approval.modifiedOn }
}

export function stageTrack (statuses: StageInput[], current: Ref<Status>, history: ItemHistory): StageTrack {
  const seen = new Set<Ref<Status>>()
  const ordered = CATEGORIES.flatMap((category) =>
    statuses.filter((status) => {
      if (status.category !== category || seen.has(status._id)) return false
      seen.add(status._id)
      return true
    })
  )
  const currentStatus = ordered.find((status) => status._id === current)
  const lostStatus = currentStatus?.category === task.statusCategory.Lost ? currentStatus : undefined
  const isOnWon = currentStatus?.category === task.statusCategory.Won
  const path = ordered.filter(
    (status) =>
      status.category !== task.statusCategory.Lost &&
      (!isOnWon || status.category !== task.statusCategory.Won || status._id === current)
  )
  const currentIndex = path.findIndex((status) => status._id === current)
  const entered = new Set(history.moves.map((move) => move.status))
  const stateAt = (status: Ref<Status>, index: number): StageState => {
    if (index === currentIndex) return 'current'
    if (currentIndex === -1) return entered.has(status) ? 'done' : 'upcoming'
    if (index > currentIndex) return 'upcoming'
    return entered.has(status) ? 'done' : 'skipped'
  }
  const stages = path.map((status, index): Stage => {
    const state = stateAt(status._id, index)
    const stage: Stage = { status: status._id, name: status.name, state, approval: status.approval }
    if (status.approval !== undefined) stage.gate = gateState(state, status._id, history.requests)
    return stage
  })
  return lostStatus === undefined ? { stages } : { stages, lost: { status: lostStatus._id, name: lostStatus.name } }
}

export function nextStage (track: StageTrack): Stage | undefined {
  const currentIndex = track.stages.findIndex((stage) => stage.state === 'current')
  return currentIndex === -1 ? undefined : track.stages[currentIndex + 1]
}
