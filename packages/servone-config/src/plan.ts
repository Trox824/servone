import { AccountRole, type Doc, hasAccountRole, TxFactory, type TxCUD } from '@hcengineering/core'
import type { ConfigSession } from './client'
import { isJsonObject, type Json, JsonReader, parseJsonText } from './json'
import { maxRisk, unquote } from './ops/common'
import type { Operation } from './operations'
import { isOperationKind, OPERATIONS, runStep, type StepContext } from './registry'
import { loadState } from './state'
import type { ChangeRecord, DiffLine, ParsedOperations, Plan, RiskLevel, ValidationIssue } from './types'

function summarize (diff: DiffLine[]): string {
  if (diff.length === 0) return 'Không có thay đổi'
  const first = unquote(diff[0].text)
  return diff.length === 1 ? first : `${first} (+${diff.length - 1} thay đổi khác)`
}

export async function plan (session: ConfigSession, ops: Operation[], replanning?: ChangeRecord): Promise<Plan> {
  const state = await loadState(session.client)
  const modelVersion = state.version()
  const ctx: StepContext = {
    state,
    factory: new TxFactory(session.account.primarySocialId),
    client: session.client,
    account: session.account,
    replanning
  }
  const issues: ValidationIssue[] = []
  if (!hasAccountRole(session.account, AccountRole.Maintainer)) {
    issues.push({ opIndex: -1, code: 'forbidden', message: 'Chỉ quản trị viên (Maintainer trở lên) được đổi cấu hình' })
  }
  if (ops.length === 0) issues.push({ opIndex: -1, code: 'invalid-input', message: 'Không có thao tác nào' })

  // Skipped ops leave the plan so a saved draft stores only real work; issue opIndex still counts input positions.
  const planned: Operation[] = []
  const txes: Array<TxCUD<Doc>> = []
  const inverses: Operation[][] = []
  const diff: DiffLine[] = []
  const typeKeys = new Set<string>()
  let risk: RiskLevel = 'safe'
  for (const [opIndex, op] of ops.entries()) {
    const step = await runStep(op.op, op, ctx)
    if (step.isSkipped) continue
    planned.push(op)
    if (step.issues.length > 0) {
      issues.push(...step.issues.map((it) => ({ ...it, opIndex })))
      continue
    }
    state.apply(step.txes)
    txes.push(...step.txes)
    inverses.unshift(step.inverse)
    diff.push(...step.diff)
    risk = maxRisk(risk, step.risk)
    for (const key of step.typeKeys) typeKeys.add(key)
  }

  return {
    ops: planned,
    inverse: inverses.flat(),
    txes: issues.length > 0 ? [] : txes,
    risk,
    diff,
    issues,
    modelVersion,
    typeKeys: [...typeKeys],
    summary: summarize(diff)
  }
}

export function parseOperations (input: Json): ParsedOperations {
  if (!Array.isArray(input)) {
    return { ops: [], issues: [{ opIndex: -1, code: 'invalid-input', message: 'Cần một danh sách thao tác' }] }
  }
  const ops: Operation[] = []
  const issues: ValidationIssue[] = []
  for (const [opIndex, entry] of input.entries()) {
    if (!isJsonObject(entry)) {
      issues.push({ opIndex, code: 'invalid-input', message: 'Mỗi thao tác phải là một đối tượng' })
      continue
    }
    const reader = new JsonReader(entry)
    const kind = reader.string('op')
    if (!isOperationKind(kind)) {
      issues.push({ opIndex, code: 'unknown-operation', message: `Thao tác không hỗ trợ: ${kind}` })
      continue
    }
    const op = OPERATIONS[kind].parse(reader)
    if (reader.problems.length > 0) {
      for (const message of reader.problems) issues.push({ opIndex, code: 'invalid-input', message })
      continue
    }
    ops.push(op)
  }
  return { ops, issues }
}

export function parseOperationsJson (text: string): ParsedOperations {
  const parsed = parseJsonText(text)
  if (parsed.kind === 'invalid') return { ops: [], issues: [{ opIndex: -1, code: 'invalid-input', message: parsed.message }] }
  return parseOperations(parsed.json)
}
