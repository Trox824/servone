import { isJsonObject, type Json, JsonReader, parseJsonText } from './json'
import { isValidKey } from './keys'
import type { AddFieldOp, AddLinkOp, CreateGroupOp, CreateTypeOp, Operation } from './operations'
import { parseOperations } from './plan'
import type { ConfigSnapshot, ValidationIssue } from './types'

export type PackOperation =
  | (CreateTypeOp & { packKey: string })
  | (AddFieldOp & { packKey: string })
  | (AddLinkOp & { key: string, packKey: string })
  | (CreateGroupOp & { packKey: string })

export interface Pack {
  key: string
  version: number
  name: string
  description: string
  industry: string
  operations: PackOperation[]
}

export type PackMeta = Omit<Pack, 'operations'>

export type ParsedPack = { kind: 'pack', pack: Pack } | { kind: 'invalid', issues: ValidationIssue[] }

export type PackInstallState = 'installed' | 'partial' | 'notInstalled'

export interface PackContents {
  typeNames: string[]
  fieldCount: number
  linkCount: number
  groupCount: number
}

type PackStep = { kind: 'op', op: PackOperation } | { kind: 'issue', issue: ValidationIssue }

const WHOLE_PACK = -1

function packIssue (message: string): ValidationIssue {
  return { opIndex: WHOLE_PACK, code: 'invalid-input', message }
}

function packStep (op: Operation, packKey: string, opIndex: number): PackStep {
  if (op.op !== 'createType' && op.op !== 'addField' && op.op !== 'addLink' && op.op !== 'createGroup') {
    const message = `Gói chỉ tạo biểu mẫu, trường, liên kết và nhóm trường; không dùng được thao tác ${op.op}`
    return { kind: 'issue', issue: { opIndex, code: 'unsupported', message } }
  }
  if (op.packKey !== undefined && op.packKey !== packKey) {
    const message = `Thao tác thuộc gói "${op.packKey}", không phải gói "${packKey}"`
    return { kind: 'issue', issue: { opIndex, code: 'invalid-input', message } }
  }
  if (op.op === 'addLink') {
    if (op.key === undefined) {
      const message = 'Liên kết trong gói cần khóa (key) để cài lại không tạo liên kết trùng'
      return { kind: 'issue', issue: { opIndex, code: 'invalid-input', message } }
    }
    return { kind: 'op', op: { ...op, key: op.key, packKey } }
  }
  return { kind: 'op', op: { ...op, packKey } }
}

function packOpIdentity (op: PackOperation): { scope: string, message: string } {
  switch (op.op) {
    case 'createType':
      return { scope: `createType:${op.key}`, message: `Khóa biểu mẫu "${op.key}" xuất hiện nhiều lần trong gói` }
    case 'addField':
      return { scope: `addField:${op.type}:${op.key}`, message: `Khóa trường "${op.key}" xuất hiện nhiều lần trong "${op.type}"` }
    case 'addLink':
      return { scope: `addLink:${op.key}`, message: `Khóa liên kết "${op.key}" xuất hiện nhiều lần trong gói` }
    case 'createGroup':
      return { scope: `createGroup:${op.key}`, message: `Khóa nhóm trường "${op.key}" xuất hiện nhiều lần trong gói` }
  }
}

export function parsePack (input: Json): ParsedPack {
  if (!isJsonObject(input)) return { kind: 'invalid', issues: [packIssue('Gói phải là một đối tượng JSON')] }
  const reader = new JsonReader(input)
  const key = reader.string('key')
  const version = reader.number('version')
  const name = reader.string('name')
  const description = reader.string('description')
  const industry = reader.string('industry')
  const issues = reader.problems.map(packIssue)
  if (reader.has('sampleRecords')) issues.push(packIssue('Gói chưa hỗ trợ hồ sơ mẫu (sampleRecords); hãy bỏ phần này'))
  if (reader.has('key') && !isValidKey(key)) {
    issues.push(packIssue(`Khóa gói "${key}" không hợp lệ: chỉ dùng chữ thường không dấu, số, ".", "-", "_"`))
  }
  if (reader.has('version') && (!Number.isInteger(version) || version < 1)) issues.push(packIssue('Phiên bản gói phải là số nguyên từ 1'))
  if (reader.has('name') && name.trim() === '') issues.push(packIssue('Tên gói không được để trống'))
  const parsed = parseOperations(input.operations ?? null)
  issues.push(...parsed.issues)
  if (issues.length > 0) return { kind: 'invalid', issues }

  // parseOperations stopped above on any unreadable entry, so ops line up with input positions here.
  const operations: PackOperation[] = []
  const seen = new Set<string>()
  for (const [opIndex, op] of parsed.ops.entries()) {
    const step = packStep(op, key, opIndex)
    if (step.kind === 'issue') {
      issues.push(step.issue)
      continue
    }
    const identity = packOpIdentity(step.op)
    // A repeated op would be skipped as already installed, so refuse it here.
    if (seen.has(identity.scope)) {
      issues.push({ opIndex, code: 'duplicate-key', message: identity.message })
      continue
    }
    seen.add(identity.scope)
    operations.push(step.op)
  }
  if (issues.length === 0 && operations.length === 0) issues.push(packIssue('Gói không có thao tác nào'))
  if (issues.length > 0) return { kind: 'invalid', issues }
  return {
    kind: 'pack',
    pack: { key, version, name: name.trim(), description: description.trim(), industry: industry.trim(), operations }
  }
}

export function parsePackJson (text: string): ParsedPack {
  const parsed = parseJsonText(text)
  if (parsed.kind === 'invalid') return { kind: 'invalid', issues: [packIssue(parsed.message)] }
  return parsePack(parsed.json)
}

function isOpInstalled (op: PackOperation, snapshot: ConfigSnapshot): boolean {
  switch (op.op) {
    case 'createType':
      return snapshot.types.some((it) => it.key === op.key && it.packKey === op.packKey && !it.isArchived)
    case 'createGroup':
      return snapshot.groups.some((it) => it.key === op.key && it.packKey === op.packKey)
    case 'addLink':
      return snapshot.links.some((it) => it.key === op.key && it.packKey === op.packKey)
    case 'addField': {
      const owner = snapshot.types.find((it) => it.key === op.type) ?? snapshot.groups.find((it) => it.key === op.type)
      return owner?.fields.some((it) => it.key === op.key && it.packKey === op.packKey) === true
    }
  }
}

// Same rule as the isInstalled hooks in ops/, read from a describe snapshot so MCP and Studio need no extra query.
export function packStatus (pack: Pack, snapshot: ConfigSnapshot): PackInstallState {
  const installed = pack.operations.filter((op) => isOpInstalled(op, snapshot)).length
  if (installed === 0) return 'notInstalled'
  return installed === pack.operations.length ? 'installed' : 'partial'
}

export function packContents (pack: Pack): PackContents {
  return {
    typeNames: pack.operations.filter((op) => op.op === 'createType').map((op) => op.name),
    fieldCount: pack.operations.filter((op) => op.op === 'addField').length,
    linkCount: pack.operations.filter((op) => op.op === 'addLink').length,
    groupCount: pack.operations.filter((op) => op.op === 'createGroup').length
  }
}
