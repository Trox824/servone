import type { Card } from '@hcengineering/card'
import type { AccountUuid, Doc, PersonId, Ref, Timestamp, TxCUD } from '@hcengineering/core'
import type { AutomationSpec, FieldKind, Operation } from './operations'

export type RiskLevel = 'safe' | 'destructive' | 'sensitive'

export interface DiffLine {
  text: string
  risk: RiskLevel
  affected?: number
}

export type IssueCode =
  | 'invalid-input'
  | 'unknown-operation'
  | 'duplicate-key'
  | 'duplicate-name'
  | 'not-found'
  | 'system-protected'
  | 'archived'
  | 'bad-option'
  | 'not-allowed'
  | 'unsupported'
  | 'forbidden'

export interface Issue {
  code: IssueCode
  message: string
}

export interface ValidationIssue extends Issue {
  opIndex: number
}

export interface ParsedOperations {
  ops: Operation[]
  issues: ValidationIssue[]
}

export interface Plan {
  ops: Operation[]
  inverse: Operation[]
  txes: Array<TxCUD<Doc>>
  risk: RiskLevel
  diff: DiffLine[]
  issues: ValidationIssue[]
  modelVersion: string
  typeKeys: string[]
  summary: string
}

export type FieldKindInfo = FieldKind | { kind: 'reference', to: string } | { kind: 'other', type: string }

export interface FieldInfo {
  key: string
  name: string
  kind: FieldKindInfo
  isRequired: boolean
  isBuiltIn: boolean
  packKey?: string
}

export interface TypeAccessInfo {
  space: string
  viewer: AccountUuid[]
  editor: AccountUuid[]
  manager: AccountUuid[]
}

export interface AutomationInfo {
  key: string
  name: string
  // null for a process built in Huly's own process editor: shown, never edited by Studio or MCP.
  automation: AutomationSpec | null
  sentences: string[]
}

export interface RecordTypeInfo {
  key: string
  name: string
  isSystem: boolean
  isArchived: boolean
  basedOn?: string
  spaces: string[]
  fields: FieldInfo[]
  access: TypeAccessInfo[]
  packKey?: string
  automations: AutomationInfo[]
}

export interface LinkInfo {
  key: string
  from: string
  to: string
  fromName: string
  toName: string
  fromMany: boolean
  toMany: boolean
  packKey?: string
}

export interface GroupInfo {
  key: string
  name: string
  type: string
  fields: FieldInfo[]
  packKey?: string
}

export interface SpaceInfo {
  id: string
  name: string
  isRestricted: boolean
  isArchived: boolean
}

export interface ConfigSnapshot {
  version: string
  types: RecordTypeInfo[]
  groups: GroupInfo[]
  links: LinkInfo[]
  spaces: SpaceInfo[]
}

export type ChangeStatus = 'draft' | 'pending' | 'applied' | 'undone' | 'rejected'

export type ChangeId = Ref<Card>

export interface ChangeRecord {
  id: ChangeId
  summary: string
  status: ChangeStatus
  risk: RiskLevel
  ops: Operation[]
  inverse: Operation[]
  diff: DiffLine[]
  typeKeys: string[]
  author: PersonId
  approver?: PersonId
  modelVersion: string
  undoOf?: ChangeId
  createdOn: Timestamp
}

export interface ApplyOptions {
  isConfirmed?: boolean
}

export type ApplyOutcome =
  | { kind: 'applied', change: ChangeRecord }
  | { kind: 'needsConfirm', change: ChangeRecord }
  | { kind: 'pendingApproval', change: ChangeRecord }

export interface ChangeFilter {
  status?: ChangeStatus
  type?: string
  limit?: number
}
