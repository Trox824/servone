import type { CardSpace, MasterTag, Tag } from '@hcengineering/card'
import type { AnyAttribute, Doc, Ref } from '@hcengineering/core'
import { PALETTE_SIZE } from '../ids'
import { isValidKey, labelText, sameName } from '../keys'
import { readServone } from '../servone-fields'
import type { ModelState } from '../state'
import type { DiffLine, Issue, IssueCode, RiskLevel } from '../types'

// Longer names wrap badly in Studio lists and card headers.
export const MAX_NAME_LEN = 120

const RISK_ORDER: RiskLevel[] = ['safe', 'destructive', 'sensitive']

export function maxRisk (a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b
}

export function issue (code: IssueCode, message: string): Issue {
  return { code, message }
}

export function quote (text: string): string {
  return `*${text}*`
}

export function unquote (text: string): string {
  return text.replace(/\*/g, '')
}

export function line (text: string, risk: RiskLevel = 'safe'): DiffLine {
  return { text, risk }
}

export function countedLine (text: string, risk: RiskLevel, affected: number): DiffLine {
  return { text, risk, affected }
}

export function colorFor (name: string): number {
  // Same hash as getColorNumberByText in packages/ui/src/colors.ts, which pulls in Svelte.
  const hash = name.split('').reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
  return Math.abs(hash) % PALETTE_SIZE
}

export function nameIssues (name: string, what: string): Issue[] {
  const trimmed = name.trim()
  if (trimmed.length === 0) return [issue('invalid-input', `Tên ${what} không được để trống`)]
  if (trimmed.length > MAX_NAME_LEN) return [issue('invalid-input', `Tên ${what} dài quá ${MAX_NAME_LEN} ký tự`)]
  return []
}

export function newKeyIssues (state: ModelState, key: string): Issue[] {
  if (!isValidKey(key)) {
    return [issue('invalid-input', `Khóa "${key}" không hợp lệ: chỉ dùng chữ thường không dấu, số, ".", "-", "_"`)]
  }
  if (state.isKeyTaken(key)) return [issue('duplicate-key', `Khóa "${key}" đã được dùng`)]
  return []
}

export function typeNameIssues (state: ModelState, name: string, except?: Ref<MasterTag>): Issue[] {
  const issues = nameIssues(name, 'biểu mẫu')
  const clash = state.activeTypes().find((it) => it._id !== except && sameName(state.nameOf(it), name))
  if (clash !== undefined) issues.push(issue('duplicate-name', `Đã có biểu mẫu tên ${quote(state.nameOf(clash))}`))
  return issues
}

export function activeTypeIssues (state: ModelState, key: string): Issue[] {
  const type = state.resolveType(key)
  if (type === undefined) return [issue('not-found', `Không tìm thấy biểu mẫu "${key}"`)]
  if (state.isArchived(type)) return [issue('archived', `Biểu mẫu ${quote(state.nameOf(type))} đã lưu trữ`)]
  return []
}

export function ownerIssues (state: ModelState, key: string): Issue[] {
  const owner = state.resolveOwner(key)
  if (owner === undefined) return [issue('not-found', `Không tìm thấy biểu mẫu hoặc nhóm trường "${key}"`)]
  if (state.isArchived(owner)) return [issue('archived', `${quote(state.nameOf(owner))} đã lưu trữ`)]
  return []
}

export function fieldIssues (state: ModelState, ownerKey: string, fieldKey: string): Issue[] {
  const issues = ownerIssues(state, ownerKey)
  if (issues.length > 0) return issues
  const owner = mustOwner(state, ownerKey)
  const field = state.resolveField(owner, fieldKey)
  if (field === undefined) return [issue('not-found', `Không tìm thấy trường "${fieldKey}" trong ${quote(state.nameOf(owner))}`)]
  if (field.attributeOf !== owner._id) {
    return [issue('not-allowed', `Trường ${quote(labelText(field.label))} thuộc loại cha; hãy sửa ở loại cha`)]
  }
  return []
}

export function spaceIssues (state: ModelState, refs: string[]): Issue[] {
  return refs
    .filter((ref) => state.resolveSpace(ref) === undefined)
    .map((ref) => issue('not-found', `Không tìm thấy không gian "${ref}"`))
}

export function targetSpaces (state: ModelState, refs: string[] | undefined): CardSpace[] {
  if (refs === undefined) return state.activeSpaces()
  return refs.flatMap((ref) => {
    const space = state.resolveSpace(ref)
    return space !== undefined ? [space] : []
  })
}

export function mustType (state: ModelState, key: string): MasterTag {
  const found = state.resolveType(key)
  if (found === undefined) throw new Error(`Type "${key}" disappeared after validation`)
  return found
}

export function mustOwner (state: ModelState, key: string): MasterTag | Tag {
  const found = state.resolveOwner(key)
  if (found === undefined) throw new Error(`Owner "${key}" disappeared after validation`)
  return found
}

export function mustField (state: ModelState, owner: MasterTag | Tag, key: string): AnyAttribute {
  const found = state.resolveField(owner, key)
  if (found === undefined) throw new Error(`Field "${key}" disappeared after validation`)
  return found
}

export function mustSpace (state: ModelState, ref: string): CardSpace {
  const found = state.resolveSpace(ref)
  if (found === undefined) throw new Error(`Space "${ref}" disappeared after validation`)
  return found
}

export function isPackInstalled (doc: Doc | undefined, packKey: string | undefined): boolean {
  return packKey !== undefined && doc !== undefined && readServone(doc).servonePackKey === packKey
}
