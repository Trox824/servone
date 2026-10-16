import type { AccountUuid, Class, Doc, PersonId, Ref, Space, TxCUD } from '@hcengineering/core'
import type {
  ChangeId,
  ChangeRecord,
  ConfigSnapshot,
  FieldInfo,
  FieldKindInfo,
  GroupInfo,
  LinkInfo,
  Operation,
  Plan,
  RecordTypeInfo,
  SpaceInfo
} from '@servone/config'

export function changeId (raw: string): ChangeId {
  return raw as ChangeId
}

export function personId (raw: string): PersonId {
  return raw as PersonId
}

export function accountId (raw: string): AccountUuid {
  return raw as AccountUuid
}

export function recordType (key: string, name: string, extra: Partial<RecordTypeInfo> = {}): RecordTypeInfo {
  return { key, name, isSystem: false, isArchived: false, spaces: [], fields: [], access: [], automations: [], ...extra }
}

export function field (key: string, name: string, kind: FieldKindInfo = { kind: 'text' }, extra: Partial<FieldInfo> = {}): FieldInfo {
  return { key, name, kind, isRequired: false, isBuiltIn: false, ...extra }
}

export function space (id: string, name: string, extra: Partial<SpaceInfo> = {}): SpaceInfo {
  return { id, name, isRestricted: false, isArchived: false, ...extra }
}

export function link (key: string, from: string, to: string, extra: Partial<LinkInfo> = {}): LinkInfo {
  return { key, from, to, fromName: to, toName: from, fromMany: false, toMany: true, ...extra }
}

export function group (key: string, name: string, type: string, fields: FieldInfo[] = []): GroupInfo {
  return { key, name, type, fields }
}

export function snapshotOf (parts: Partial<ConfigSnapshot>): ConfigSnapshot {
  return { version: 'v1', types: [], groups: [], links: [], spaces: [], ...parts }
}

export function change (id: string, extra: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    id: changeId(id),
    summary: `Thay đổi ${id}`,
    status: 'draft',
    risk: 'safe',
    ops: [],
    inverse: [],
    diff: [],
    typeKeys: [],
    author: personId('lan'),
    modelVersion: 'v1',
    createdOn: 0,
    ...extra
  }
}

function fakeTx (): TxCUD<Doc> {
  return {
    _id: 'tx' as Ref<TxCUD<Doc>>,
    _class: 'core:class:TxCreateDoc' as Ref<Class<TxCUD<Doc>>>,
    space: 'core:space:Tx' as Ref<Space>,
    objectSpace: 'core:space:Model' as Ref<Space>,
    objectId: 'doc' as Ref<Doc>,
    objectClass: 'core:class:Doc' as Ref<Class<Doc>>,
    modifiedOn: 0,
    modifiedBy: personId('lan')
  }
}

export function planned (ops: Operation[], extra: Partial<Plan> = {}): Plan {
  return {
    ops,
    inverse: [],
    txes: ops.map(() => fakeTx()),
    risk: 'safe',
    diff: [],
    issues: [],
    modelVersion: 'v1',
    typeKeys: [],
    summary: 'Kế hoạch',
    ...extra
  }
}
