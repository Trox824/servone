import type { Person } from '@hcengineering/contact'
import core, { type PersonId, type Ref, type Status, type StatusCategory } from '@hcengineering/core'
import task from '@hcengineering/task'
import { type GateRequest, type ItemHistory, nextStage, stageTrack, type StageInput, statusMoves, type StatusTx } from '../stages'

function status (name: string, category: Ref<StatusCategory>, approval?: StageInput['approval']): StageInput {
  return { _id: `status:${name}` as Ref<Status>, name, category, approval }
}

const newStatus = status('New', task.statusCategory.UnStarted)
const screening = status('Screening', task.statusCategory.ToDo)
const interview = status('Interview', task.statusCategory.Active)
const offer = status('Offer', task.statusCategory.Active, { by: 'manager' })
const hired = status('Hired', task.statusCategory.Won)
const notContinued = status('Not continued', task.statusCategory.Lost)
const hiring = [newStatus, screening, interview, offer, hired, notContinued]

const mover = 'social-mover' as PersonId
const approver = 'person-approver' as Ref<Person>

function went (...path: StageInput[]): ItemHistory {
  return { moves: path.map((stage, index) => ({ status: stage._id, by: mover, on: (index + 1) * 100 })), requests: [] }
}

function request (gate: StageInput, status: string, filedOn: number): GateRequest {
  return {
    servoneGate: gate._id,
    status,
    modifiedOn: filedOn + 10,
    requested: [approver],
    approved: status === 'Completed' ? [approver] : [],
    approvedDates: status === 'Completed' ? [filedOn + 5] : []
  }
}

function states (statuses: StageInput[], current: StageInput, history = went(...statuses)): string[] {
  return stageTrack(statuses, current._id, history).stages.map((stage) => `${stage.name}:${stage.state}`)
}

describe('stageTrack', () => {
  it('marks entered steps before the current one done and after it upcoming, leaving Lost out', () => {
    expect(states(hiring, interview, went(newStatus, screening, interview))).toEqual([
      'New:done',
      'Screening:done',
      'Interview:current',
      'Offer:upcoming',
      'Hired:upcoming'
    ])
    expect(stageTrack(hiring, interview._id, went(interview)).lost).toBeUndefined()
  })

  it('marks steps before the current one that the item never entered as skipped', () => {
    expect(states(hiring, interview, went(newStatus, interview))).toEqual([
      'New:done',
      'Screening:skipped',
      'Interview:current',
      'Offer:upcoming',
      'Hired:upcoming'
    ])
  })

  it('keeps the approval rule on its step', () => {
    const stages = stageTrack(hiring, newStatus._id, went(newStatus)).stages
    expect(stages.find((stage) => stage.name === 'Offer')?.approval).toEqual({ by: 'manager' })
    expect(stages.find((stage) => stage.name === 'Interview')?.approval).toBeUndefined()
  })

  it('orders by category, then by the project type order inside a category', () => {
    const shuffled = [hired, offer, notContinued, newStatus, interview, screening]
    expect(states(shuffled, newStatus)).toEqual([
      'New:current',
      'Screening:upcoming',
      'Offer:upcoming',
      'Interview:upcoming',
      'Hired:upcoming'
    ])
  })

  it('shows every Won status as the end until the item reaches one', () => {
    const archived = status('Archived', task.statusCategory.Won)
    const statuses = [...hiring, archived]
    expect(states(statuses, offer).slice(-2)).toEqual(['Hired:upcoming', 'Archived:upcoming'])
    expect(states(statuses, archived, went(newStatus, screening, interview, offer, archived))).toEqual([
      'New:done',
      'Screening:done',
      'Interview:done',
      'Offer:done',
      'Archived:current'
    ])
  })

  it('on a Lost status, marks only entered steps done and returns the Lost status as the end', () => {
    const track = stageTrack(hiring, notContinued._id, went(newStatus, screening, notContinued))
    expect(track.stages.map((stage) => stage.state)).toEqual(['done', 'done', 'upcoming', 'upcoming', 'upcoming'])
    expect(track.lost).toEqual({ status: notContinued._id, name: 'Not continued' })
  })

  it('drops repeated statuses', () => {
    expect(states([newStatus, screening, newStatus], screening)).toEqual(['New:done', 'Screening:current'])
  })
})

describe('stageTrack gates', () => {
  const gateOf = (current: StageInput, history: ItemHistory): unknown =>
    stageTrack(hiring, current._id, history).stages.find((stage) => stage.name === 'Offer')?.gate

  it('is ahead until the item reaches it', () => {
    expect(gateOf(interview, went(newStatus, interview))).toEqual({ kind: 'ahead' })
  })

  it('names the approver while the item waits in it', () => {
    const history = went(newStatus, interview, offer)
    history.requests = [request(offer, 'Active', 350)]
    expect(gateOf(offer, history)).toEqual({ kind: 'waiting', approver })
  })

  it('records who approved it and when once passed', () => {
    const history = went(newStatus, interview, offer, hired)
    history.requests = [request(offer, 'Rejected', 150), request(offer, 'Completed', 350)]
    expect(gateOf(hired, history)).toEqual({ kind: 'approved', approver, on: 355 })
  })

  it('is not approved when passed or skipped without a completed request', () => {
    const withdrawn = went(newStatus, interview, offer, hired)
    withdrawn.requests = [request(offer, 'Cancelled', 350)]
    expect(gateOf(hired, withdrawn)).toEqual({ kind: 'missing' })
    expect(gateOf(hired, went(newStatus, interview, hired))).toEqual({ kind: 'missing' })
  })
})

describe('nextStage', () => {
  it('is the step after the current one, and none at the end or on a Lost status', () => {
    expect(nextStage(stageTrack(hiring, interview._id, went(interview)))?.name).toBe('Offer')
    expect(nextStage(stageTrack(hiring, hired._id, went(hired)))).toBeUndefined()
    expect(nextStage(stageTrack(hiring, notContinued._id, went(notContinued)))).toBeUndefined()
  })
})

describe('statusMoves', () => {
  const tx = (fields: Omit<StatusTx, 'modifiedBy'>): StatusTx => ({ modifiedBy: mover, ...fields })

  it('reads the created status and each status change, skipping other updates and repeats', () => {
    const txes = [
      tx({ _class: core.class.TxCreateDoc, attributes: { status: newStatus._id }, modifiedOn: 1 }),
      tx({ _class: core.class.TxUpdateDoc, operations: {}, modifiedOn: 2 }),
      tx({ _class: core.class.TxUpdateDoc, operations: { status: newStatus._id }, modifiedOn: 3 }),
      tx({ _class: core.class.TxUpdateDoc, operations: { status: interview._id }, modifiedOn: 4 })
    ]
    expect(statusMoves(txes)).toEqual([
      { status: newStatus._id, by: mover, on: 1 },
      { status: interview._id, by: mover, on: 4 }
    ])
  })
})
