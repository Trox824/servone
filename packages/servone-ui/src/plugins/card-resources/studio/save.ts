import type { ApplyOutcome, ChangeId, ChangeRecord, Operation, Plan, ValidationIssue } from '@servone/config'

export type ApplyStep = ApplyOutcome | { kind: 'stale' }

export interface StudioApi {
  plan: (ops: Operation[]) => Promise<Plan>
  saveDraft: (draft: Plan) => Promise<ChangeRecord>
  apply: (id: ChangeId, isConfirmed: boolean) => Promise<ApplyStep>
  approve: (id: ChangeId, isConfirmed: boolean) => Promise<ApplyStep>
  reject: (id: ChangeId) => Promise<ChangeRecord>
  undo: (id: ChangeId) => Promise<ApplyStep>
}

export interface SaveUi {
  confirm: (change: ChangeRecord, phrase: string | undefined) => Promise<boolean>
  applied: (change: ChangeRecord) => void
  pending: (change: ChangeRecord) => void
}

export interface SaveOptions {
  confirmPhrase?: string
}

export type SaveStop =
  | { kind: 'pending', change: ChangeRecord }
  | { kind: 'cancelled' }
  | { kind: 'invalid', issues: ValidationIssue[] }
  | { kind: 'stale' }

export type SaveResult =
  | { kind: 'applied', changes: ChangeRecord[] }
  | SaveStop
  | { kind: 'partial', changes: ChangeRecord[], stopped: SaveStop }
  | { kind: 'unchanged' }
  | { kind: 'failed' }

type Settled =
  | { kind: 'applied', change: ChangeRecord }
  | { kind: 'pending', change: ChangeRecord }
  | { kind: 'cancelled' }
  | { kind: 'retry', id: ChangeId }

type BatchResult =
  | Exclude<Settled, { kind: 'retry' }>
  | { kind: 'invalid', issues: ValidationIssue[] }
  | { kind: 'unchanged' }
  | { kind: 'stale' }

interface Confirmation {
  repeat: (id: ChangeId) => Promise<ApplyStep>
  isRejectedOnCancel: boolean
}

const STALE_ATTEMPTS = 2

function fieldRef (type: string, field: string): string {
  return `${type}:${field}`
}

export function batchesOf (ops: Operation[]): Operation[][] {
  const batches: Operation[][] = [[]]
  const createdTypes = new Set<string>()
  const addedKeys = new Set<string>()
  const optionFields = new Set<string>()
  const startsNewBatch = (op: Operation): boolean => {
    if (op.op === 'setOptions') return optionFields.has(fieldRef(op.type, op.field))
    if (op.op !== 'setView') return false
    const named = [...(op.view.columns ?? [])]
    if (op.view.groupBy !== undefined && op.view.groupBy !== null) named.push(op.view.groupBy)
    return createdTypes.has(op.type) || named.some((key) => addedKeys.has(key))
  }
  for (const op of ops) {
    if (startsNewBatch(op)) {
      batches.push([])
      createdTypes.clear()
      addedKeys.clear()
      optionFields.clear()
    }
    batches[batches.length - 1].push(op)
    if (op.op === 'createType' || op.op === 'copyType') createdTypes.add(op.key)
    if (op.op === 'addField' || op.op === 'restoreField') {
      addedKeys.add(op.key)
      optionFields.add(fieldRef(op.type, op.key))
    }
    if (op.op === 'setOptions') optionFields.add(fieldRef(op.type, op.field))
  }
  return batches.filter((it) => it.length > 0)
}

function applyConfirmation (api: StudioApi, isRejectedOnCancel: boolean): Confirmation {
  return { repeat: async (id) => await api.apply(id, true), isRejectedOnCancel }
}

async function settle (
  api: StudioApi,
  ui: SaveUi,
  confirmation: Confirmation,
  id: ChangeId,
  step: ApplyStep,
  phrase: string | undefined
): Promise<Settled> {
  switch (step.kind) {
    case 'applied':
      ui.applied(step.change)
      return { kind: 'applied', change: step.change }
    case 'pendingApproval':
      ui.pending(step.change)
      return { kind: 'pending', change: step.change }
    case 'stale':
      return { kind: 'retry', id }
    case 'needsConfirm': {
      const isConfirmed = await ui.confirm(step.change, phrase)
      if (!isConfirmed) {
        if (confirmation.isRejectedOnCancel) await api.reject(step.change.id)
        return { kind: 'cancelled' }
      }
      return await settle(api, ui, confirmation, step.change.id, await confirmation.repeat(step.change.id), phrase)
    }
  }
}

async function saveBatch (api: StudioApi, ui: SaveUi, ops: Operation[], phrase: string | undefined): Promise<BatchResult> {
  for (let attempt = 1; attempt <= STALE_ATTEMPTS; attempt++) {
    const draftPlan = await api.plan(ops)
    if (draftPlan.issues.length > 0) return { kind: 'invalid', issues: draftPlan.issues }
    if (draftPlan.txes.length === 0) return { kind: 'unchanged' }
    const draft = await api.saveDraft(draftPlan)
    let settled: Settled
    try {
      settled = await settle(api, ui, applyConfirmation(api, true), draft.id, await api.apply(draft.id, false), phrase)
    } catch (err) {
      await api.reject(draft.id)
      throw err
    }
    if (settled.kind !== 'retry') return settled
    await api.reject(settled.id)
  }
  return { kind: 'stale' }
}

export async function saveOps (api: StudioApi, ui: SaveUi, ops: Operation[], options: SaveOptions = {}): Promise<SaveResult> {
  const done: ChangeRecord[] = []
  for (const batch of batchesOf(ops)) {
    const outcome = await saveBatch(api, ui, batch, options.confirmPhrase)
    if (outcome.kind === 'applied') {
      done.push(outcome.change)
      continue
    }
    if (outcome.kind === 'unchanged') continue
    return done.length > 0 ? { kind: 'partial', changes: done, stopped: outcome } : outcome
  }
  return done.length > 0 ? { kind: 'applied', changes: done } : { kind: 'unchanged' }
}

function toResult (settled: Settled): SaveResult {
  if (settled.kind === 'retry') return { kind: 'stale' }
  if (settled.kind === 'applied') return { kind: 'applied', changes: [settled.change] }
  return settled
}

export async function applyDraft (api: StudioApi, ui: SaveUi, id: ChangeId): Promise<SaveResult> {
  return toResult(await settle(api, ui, applyConfirmation(api, false), id, await api.apply(id, false), undefined))
}

export async function undoWithUi (api: StudioApi, ui: SaveUi, id: ChangeId): Promise<SaveResult> {
  const step = await api.undo(id)
  if (step.kind === 'stale') return { kind: 'stale' }
  return toResult(await settle(api, ui, applyConfirmation(api, true), step.change.id, step, undefined))
}

export async function approveWithUi (api: StudioApi, ui: SaveUi, id: ChangeId): Promise<SaveResult> {
  const approval: Confirmation = { repeat: async (pendingId) => await api.approve(pendingId, true), isRejectedOnCancel: false }
  return toResult(await settle(api, ui, approval, id, await api.approve(id, false), undefined))
}
