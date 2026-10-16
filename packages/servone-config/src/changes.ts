import { AccountRole, type Doc, type DocumentClassQuery, hasAccountRole, type PersonId, TxFactory, type TxCUD } from '@hcengineering/core'
import {
  appliedTx,
  findChanges,
  findOpenUndo,
  nextVersionTx,
  readChange,
  readVersionLock,
  redraftTx,
  statusTx,
  writeChange
} from './change-log'
import type { ConfigSession } from './client'
import { ConfigError } from './errors'
import { CHANGE_TYPE } from './ids'
import { toRef } from './keys'
import { plan } from './plan'
import { applyIf, sendTxes } from './send'
import type { ApplyOptions, ApplyOutcome, ChangeFilter, ChangeId, ChangeRecord, ChangeStatus, DiffLine, Plan } from './types'

const STATUS_LABEL: Record<ChangeStatus, string> = {
  draft: 'nháp',
  pending: 'chờ duyệt',
  applied: 'đã áp dụng',
  undone: 'đã hoàn tác',
  rejected: 'đã từ chối'
}

export async function saveDraft (session: ConfigSession, draft: Plan): Promise<ChangeRecord> {
  if (draft.issues.length > 0) throw new ConfigError('invalid', 'Kế hoạch còn lỗi; hãy sửa trước khi lưu')
  // A plan whose ops were all skipped as installed would be stored as a draft that can never apply.
  if (draft.ops.length === 0) throw new ConfigError('invalid', 'Không có thay đổi nào để lưu')
  return await writeChange(session, draft, 'draft')
}

export async function getChange (session: ConfigSession, id: ChangeId): Promise<ChangeRecord> {
  return await readChange(session, id)
}

export async function listChanges (session: ConfigSession, filter: ChangeFilter = {}): Promise<ChangeRecord[]> {
  return await findChanges(session, filter)
}

export function parseChangeId (raw: string): ChangeId {
  const id = raw.trim()
  if (id.length === 0) throw new ConfigError('invalid', 'Thiếu mã thay đổi')
  return toRef(id)
}

export function requireMaintainer (session: ConfigSession): void {
  if (!hasAccountRole(session.account, AccountRole.Maintainer)) {
    throw new ConfigError('forbidden', 'Chỉ quản trị viên (Maintainer trở lên) được đổi cấu hình')
  }
}

function requireStatus (change: ChangeRecord, allowed: ChangeStatus[], action: string): void {
  if (!allowed.includes(change.status)) {
    throw new ConfigError('wrong-status', `Thay đổi đang ở trạng thái ${STATUS_LABEL[change.status]}, không ${action} được`)
  }
}

function hasDestructiveLine (diff: DiffLine[]): boolean {
  return diff.some((it) => it.risk === 'destructive')
}

// Carries the re-plan's diff/risk into the outcome so a needsConfirm shows the current affected counts, not the stale stored ones.
function withReplan (change: ChangeRecord, replanned: Plan): ChangeRecord {
  return { ...change, diff: replanned.diff, risk: replanned.risk }
}

function statusMatch (id: ChangeId, expected: ChangeStatus): DocumentClassQuery<Doc> {
  return { _class: CHANGE_TYPE, query: { _id: id, servoneStatus: expected } }
}

export interface Replanned {
  plan: Plan
  versionLock: DocumentClassQuery<Doc>
}

function staleError (): ConfigError {
  return new ConfigError('stale', 'Cấu hình đã thay đổi từ lúc soạn; hãy soạn lại thay đổi này')
}

function requireNoIssues (replanned: Plan): void {
  if (replanned.issues.length > 0) {
    throw new ConfigError('invalid', replanned.issues.map((it) => it.message).join('; '))
  }
}

async function planAgainstCurrent (session: ConfigSession, change: ChangeRecord): Promise<Replanned> {
  const versionLock = await readVersionLock(session)
  return { plan: await plan(session, change.ops, change), versionLock }
}

export async function replan (session: ConfigSession, change: ChangeRecord): Promise<Replanned> {
  const replanned = await planAgainstCurrent(session, change)
  // Checked before issues: a moved model often also turns into issues, and "stale" tells the user to redraft.
  if (replanned.plan.modelVersion !== change.modelVersion) throw staleError()
  requireNoIssues(replanned.plan)
  return replanned
}

// Guards the write with the status this call read, so a concurrent transition (another approver, a reject) fails the whole apply instead of racing it.
async function moveStatus (session: ConfigSession, change: ChangeRecord, status: ChangeStatus, approver?: PersonId): Promise<ChangeRecord> {
  const factory = new TxFactory(session.account.primarySocialId)
  await sendTxes(session, [statusTx(factory, change.id, status, approver)], [statusMatch(change.id, change.status)])
  return await readChange(session, change.id)
}

async function commitRejection (session: ConfigSession, change: ChangeRecord): Promise<ConfigError> {
  const isStatusMoved = (await readChange(session, change.id)).status !== change.status
  const isTargetMoved = change.undoOf !== undefined && (await readChange(session, change.undoOf)).status !== 'applied'
  if (isStatusMoved || isTargetMoved) return new ConfigError('wrong-status', 'Thay đổi đã bị cập nhật ở nơi khác; hãy tải lại')
  return staleError()
}

export async function commit (
  session: ConfigSession,
  change: ChangeRecord,
  replanned: Replanned,
  approver?: PersonId
): Promise<ChangeRecord> {
  const factory = new TxFactory(session.account.primarySocialId)
  const txes: Array<TxCUD<Doc>> = [...replanned.plan.txes, appliedTx(factory, change.id, replanned.plan, approver), nextVersionTx(factory)]
  const match: DocumentClassQuery<Doc>[] = [statusMatch(change.id, change.status), replanned.versionLock]
  if (change.undoOf !== undefined) {
    txes.push(statusTx(factory, change.undoOf, 'undone'))
    // Undoing only ever targets an applied change; guards against undoing twice at once.
    match.push(statusMatch(change.undoOf, 'applied'))
  }
  if (!(await applyIf(session, txes, match))) throw await commitRejection(session, change)
  return await readChange(session, change.id)
}

export async function applyChange (session: ConfigSession, id: ChangeId, options: ApplyOptions = {}): Promise<ApplyOutcome> {
  requireMaintainer(session)
  const change = await readChange(session, id)
  requireStatus(change, ['draft'], 'áp dụng')
  const replanned = await replan(session, change)
  // Before the sensitive branch: maxRisk folds destructive into sensitive, hiding a destructive line from it.
  if (hasDestructiveLine(replanned.plan.diff) && options.isConfirmed !== true) {
    return { kind: 'needsConfirm', change: withReplan(change, replanned.plan) }
  }
  if (replanned.plan.risk === 'sensitive') {
    return { kind: 'pendingApproval', change: await moveStatus(session, change, 'pending') }
  }
  return { kind: 'applied', change: await commit(session, change, replanned) }
}

export async function approveChange (session: ConfigSession, id: ChangeId, options: ApplyOptions = {}): Promise<ApplyOutcome> {
  requireMaintainer(session)
  const change = await readChange(session, id)
  requireStatus(change, ['pending'], 'duyệt')
  if (session.account.socialIds.includes(change.author)) {
    throw new ConfigError('self-approval', 'Người đề xuất không tự duyệt được; cần một quản trị viên khác')
  }
  // A pending change may wait for days while other changes land; fail on the fingerprint and it could never be approved.
  // Drift instead shows the approver the fresh diff, as a destructive line does. isConfirmed is the approver's own.
  const replanned = await planAgainstCurrent(session, change)
  requireNoIssues(replanned.plan)
  const isDrifted = replanned.plan.modelVersion !== change.modelVersion
  if ((isDrifted || hasDestructiveLine(replanned.plan.diff)) && options.isConfirmed !== true) {
    return { kind: 'needsConfirm', change: withReplan(change, replanned.plan) }
  }
  return { kind: 'applied', change: await commit(session, change, replanned, session.account.primarySocialId) }
}

export async function rejectChange (session: ConfigSession, id: ChangeId): Promise<ChangeRecord> {
  requireMaintainer(session)
  const change = await readChange(session, id)
  requireStatus(change, ['draft', 'pending'], 'từ chối')
  return await moveStatus(session, change, 'rejected')
}

export async function undoChange (session: ConfigSession, id: ChangeId, options: ApplyOptions = {}): Promise<ApplyOutcome> {
  requireMaintainer(session)
  const change = await readChange(session, id)
  requireStatus(change, ['applied'], 'hoàn tác')
  if (change.inverse.length === 0) throw new ConfigError('invalid', 'Thay đổi này không có thao tác hoàn tác')
  const open = await findOpenUndo(session, change.id)
  if (open?.status === 'pending') return { kind: 'pendingApproval', change: open }
  // An open undo draft must not count as a pending namesake of its own inverse.
  const undoPlan = await plan(session, change.inverse, open)
  if (undoPlan.issues.length > 0) throw new ConfigError('invalid', undoPlan.issues.map((it) => it.message).join('; '))
  if (open === undefined) return await applyChange(session, (await writeChange(session, undoPlan, 'draft', change.id)).id, options)
  // The waiting draft may predate later changes; refresh it so its re-plan is not stale.
  const factory = new TxFactory(session.account.primarySocialId)
  await sendTxes(session, [redraftTx(factory, open.id, undoPlan)], [statusMatch(open.id, 'draft')])
  return await applyChange(session, open.id, options)
}
