import card, { type MasterTag } from '@hcengineering/card'
import { getCurrentAccount, type AnyAttribute } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import { addNotification, NotificationSeverity } from '@hcengineering/ui'
import { SimpleNotification } from '@hcengineering/view-resources'
import {
  applyChange,
  approveChange,
  ConfigError,
  plan,
  rejectChange,
  saveDraft,
  undoChange,
  type ApplyOutcome,
  type ChangeRecord,
  type ConfigSession,
  type ValidationIssue
} from '@servone/config'
import UndoToast from './components/UndoToast.svelte'
import type { ApplyStep, SaveResult, StudioApi } from './save'
import { text } from './strings'
import { registerUndoAction } from './undo-actions'

export function studioSession (): ConfigSession {
  return { client: getClient(), account: getCurrentAccount() }
}

async function unlessStale (outcome: Promise<ApplyOutcome>): Promise<ApplyStep> {
  try {
    return await outcome
  } catch (err) {
    if (err instanceof ConfigError && err.code === 'stale') return { kind: 'stale' }
    throw err
  }
}

export function studioApi (session: ConfigSession): StudioApi {
  return {
    plan: async (ops) => await plan(session, ops),
    saveDraft: async (draft) => await saveDraft(session, draft),
    apply: async (id, isConfirmed) => await unlessStale(applyChange(session, id, { isConfirmed })),
    approve: async (id, isConfirmed) => await unlessStale(approveChange(session, id, { isConfirmed })),
    reject: async (id) => await rejectChange(session, id),
    undo: async (id) => await unlessStale(undoChange(session, id))
  }
}

export function showError (message: string): void {
  addNotification(text('ChangeFailed'), message, SimpleNotification, undefined, NotificationSeverity.Error)
}

export function showIssues (issues: ValidationIssue[]): void {
  showError(issues.map((it) => it.message).join('; '))
}

export function showStale (): void {
  showError(text('Stale'))
}

export function showPartial (changes: ChangeRecord[]): void {
  addNotification(
    text('PartialSaved'),
    text('PartialSavedBody', { done: changes.map((it) => it.summary).join('; ') }),
    SimpleNotification,
    undefined,
    NotificationSeverity.Warning
  )
}

export function showPending (change: ChangeRecord): void {
  addNotification(
    text('SentForApproval'),
    `${change.summary}. ${text('SentForApprovalBody')}`,
    SimpleNotification,
    undefined,
    NotificationSeverity.Info
  )
}

export function showUndoToast (change: ChangeRecord, onUndo: () => void): void {
  registerUndoAction(change.id, onUndo)
  addNotification(change.summary, text('AppliedBody'), UndoToast, { changeId: change.id }, NotificationSeverity.Success)
}

export async function guarded (action: () => Promise<SaveResult>): Promise<SaveResult> {
  try {
    return await action()
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    showError(err.message)
    return { kind: 'failed' }
  }
}

function servoneKeyOr (doc: MasterTag | AnyAttribute, fallback: string): string {
  return 'servoneKey' in doc && typeof doc.servoneKey === 'string' ? doc.servoneKey : fallback
}

export function typeKeyOf (doc: MasterTag): string {
  return servoneKeyOr(doc, doc._id)
}

export function typeDoc (key: string): MasterTag | undefined {
  return getClient()
    .getModel()
    .findAllSync(card.class.MasterTag, {})
    .find((it) => typeKeyOf(it) === key)
}
