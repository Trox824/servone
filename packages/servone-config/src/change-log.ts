import card, { type Card, type CardSpace, type MasterTag } from '@hcengineering/card'
import core, {
  type AccountUuid,
  type AnyAttribute,
  ClassifierKind,
  type Class,
  type Data,
  type Doc,
  type DocumentClassQuery,
  type DocumentQuery,
  type DocumentUpdate,
  generateId,
  type MarkupBlobRef,
  type PersonId,
  type PropertyType,
  SortingOrder,
  type Type,
  type TxCUD,
  TxFactory
} from '@hcengineering/core'
import { ArrOf, TypePersonId, TypeRef, TypeString } from '@hcengineering/model'
import setting, { type Editable } from '@hcengineering/setting'
import type { ConfigSession } from './client'
import { ConfigError } from './errors'
import { APPLY_SCOPE, CHANGE_SPACE, CHANGE_SPACE_NAME, CHANGE_TYPE, CHANGE_TYPE_NAME } from './ids'
import { isJsonObject, type Json, JsonReader } from './json'
import { toLabel, toPersonId, toRef } from './keys'
import type { Operation } from './operations'
import { parseOperationsJson } from './plan'
import { readServone, withServone } from './servone-fields'
import { isLockedType } from './state'
import type { ChangeFilter, ChangeId, ChangeRecord, ChangeStatus, DiffLine, Plan, RiskLevel } from './types'

// One page of Studio's history list.
export const DEFAULT_CHANGE_LIMIT = 50

// Same empty content as createCard in plugins/card-resources/src/utils.ts.
const EMPTY_CONTENT = '' as MarkupBlobRef

const STATUSES: ChangeStatus[] = ['draft', 'pending', 'applied', 'undone', 'rejected']
const RISKS: RiskLevel[] = ['safe', 'destructive', 'sensitive']

interface ChangeFields {
  servoneStatus: ChangeStatus
  servoneRisk: RiskLevel
  servoneAuthor: PersonId
  servoneApprover?: PersonId
  servoneTypeKeys: string[]
  servoneOps: string
  servoneInverse: string
  servoneDiff: string
  servoneModelVersion: string
  servoneUndoOf?: ChangeId
}

interface LogField {
  name: keyof ChangeFields
  label: string
  type: Type<PropertyType>
  isHidden: boolean
}

const LOG_FIELDS: LogField[] = [
  { name: 'servoneStatus', label: 'Trạng thái', type: TypeString(), isHidden: false },
  { name: 'servoneRisk', label: 'Mức rủi ro', type: TypeString(), isHidden: false },
  { name: 'servoneAuthor', label: 'Người đề xuất', type: TypePersonId(), isHidden: false },
  { name: 'servoneApprover', label: 'Người duyệt', type: TypePersonId(), isHidden: false },
  { name: 'servoneTypeKeys', label: 'Biểu mẫu liên quan', type: ArrOf(TypeString()), isHidden: false },
  { name: 'servoneUndoOf', label: 'Hoàn tác của', type: TypeRef(CHANGE_TYPE), isHidden: false },
  { name: 'servoneOps', label: 'Thao tác', type: TypeString(), isHidden: true },
  { name: 'servoneInverse', label: 'Thao tác hoàn tác', type: TypeString(), isHidden: true },
  { name: 'servoneDiff', label: 'Chi tiết thay đổi', type: TypeString(), isHidden: true },
  { name: 'servoneModelVersion', label: 'Phiên bản cấu hình', type: TypeString(), isHidden: true }
]

function changeTypeTxes (factory: TxFactory): Array<TxCUD<Doc>> {
  const type: Data<MasterTag> = {
    extends: card.class.Card,
    label: toLabel(CHANGE_TYPE_NAME),
    kind: ClassifierKind.CLASS,
    icon: card.icon.MasterTag
  }
  const txes: Array<TxCUD<Doc>> = [
    factory.createTxCreateDoc(card.class.MasterTag, core.space.Model, type, CHANGE_TYPE)
  ]
  for (const field of LOG_FIELDS) {
    const attribute: Data<AnyAttribute> = {
      attributeOf: CHANGE_TYPE,
      name: field.name,
      label: toLabel(field.label),
      type: field.type,
      hidden: field.isHidden
    }
    txes.push(factory.createTxCreateDoc(core.class.Attribute, core.space.Model, attribute))
  }
  return txes
}

function changeSpaceTx (factory: TxFactory, member: AccountUuid): TxCUD<Doc> {
  const space: Data<CardSpace> = {
    name: CHANGE_SPACE_NAME,
    description: '',
    private: false,
    members: [member],
    archived: false,
    type: card.spaceType.SpaceType,
    types: [CHANGE_TYPE]
  }
  return factory.createTxCreateDoc(card.class.CardSpace, core.space.Space, space, CHANGE_SPACE)
}

// Editable=false makes Huly's type settings treat it like a system type. It must be its own tx after the create:
// OnMasterTagCreate sets Editable=true on every new type, overriding one sent in the same apply.
function lockTypeTx (factory: TxFactory): TxCUD<Doc> {
  return factory.createTxMixin<Class<Doc>, Editable>(CHANGE_TYPE, card.class.MasterTag, core.space.Model, setting.mixin.Editable, { value: false })
}

export async function ensureChangeLog (session: ConfigSession): Promise<void> {
  const factory = new TxFactory(session.account.primarySocialId)
  const [type] = await session.client.findAll(card.class.MasterTag, { _id: CHANGE_TYPE })
  const [space] = await session.client.findAll(card.class.CardSpace, { _id: CHANGE_SPACE })
  if (type === undefined || space === undefined) {
    const spaceTx = changeSpaceTx(factory, session.account.uuid)
    const txes = type === undefined ? [...changeTypeTxes(factory), spaceTx] : [spaceTx]
    const guard: DocumentClassQuery<Doc> =
      type === undefined
        ? { _class: card.class.MasterTag, query: { _id: CHANGE_TYPE } }
        : { _class: card.class.CardSpace, query: { _id: CHANGE_SPACE } }
    // A concurrent first use makes notMatch fail; the log then exists, which is all this needs.
    await session.client.tx(factory.createTxApplyIf(core.space.Tx, APPLY_SCOPE, [], [guard], txes, undefined))
  } else {
    await joinChangeLog(session, space)
  }
  if (type === undefined || !isLockedType(type)) await session.client.tx(lockTypeTx(factory))
}

// The transactor shows cards of a public space only to its members, so whoever reads or writes the log must be one.
async function joinChangeLog (session: ConfigSession, space: CardSpace): Promise<void> {
  if (space.members.includes(session.account.uuid)) return
  const factory = new TxFactory(session.account.primarySocialId)
  const update: DocumentUpdate<CardSpace> = { $push: { members: session.account.uuid } }
  await session.client.tx(factory.createTxUpdateDoc(card.class.CardSpace, core.space.Space, CHANGE_SPACE, update))
}

async function joinExistingChangeLog (session: ConfigSession): Promise<void> {
  const [space] = await session.client.findAll(card.class.CardSpace, { _id: CHANGE_SPACE })
  if (space !== undefined) await joinChangeLog(session, space)
}

// Read before the re-plan's fingerprint check; every commit replaces the token, so a commit that lands after the check makes ours fail.
export async function readVersionLock (session: ConfigSession): Promise<DocumentClassQuery<Doc>> {
  const [space] = await session.client.findAll(card.class.CardSpace, { _id: CHANGE_SPACE })
  const version = space !== undefined ? readServone(space).servoneConfigVersion : undefined
  return { _class: card.class.CardSpace, query: { _id: CHANGE_SPACE, servoneConfigVersion: version ?? { $exists: false } } }
}

export function nextVersionTx (factory: TxFactory): TxCUD<Doc> {
  const update: DocumentUpdate<CardSpace> = {}
  return factory.createTxUpdateDoc(card.class.CardSpace, core.space.Space, CHANGE_SPACE, withServone(update, { servoneConfigVersion: generateId() }))
}

function fieldsUpdate (fields: Partial<ChangeFields>): DocumentUpdate<Card> {
  const update: DocumentUpdate<Card> = {}
  return Object.assign(update, fields)
}

export function statusTx (factory: TxFactory, id: ChangeId, status: ChangeStatus, approver?: PersonId): TxCUD<Doc> {
  const fields: Partial<ChangeFields> = { servoneStatus: status }
  if (approver !== undefined) fields.servoneApprover = approver
  return factory.createTxUpdateDoc<Card>(CHANGE_TYPE, CHANGE_SPACE, id, fieldsUpdate(fields))
}

// Undo replays the stored inverse, so it must describe the model this apply actually changed, not the one at draft time.
export function appliedTx (factory: TxFactory, id: ChangeId, replanned: Plan, approver?: PersonId): TxCUD<Doc> {
  const fields: Partial<ChangeFields> = { servoneStatus: 'applied', ...planFields(replanned) }
  if (approver !== undefined) fields.servoneApprover = approver
  const update = fieldsUpdate(fields)
  update.title = replanned.summary
  return factory.createTxUpdateDoc<Card>(CHANGE_TYPE, CHANGE_SPACE, id, update)
}

export function redraftTx (factory: TxFactory, id: ChangeId, draft: Plan): TxCUD<Doc> {
  const update = fieldsUpdate({ ...planFields(draft), servoneOps: JSON.stringify(draft.ops), servoneModelVersion: draft.modelVersion })
  update.title = draft.summary
  return factory.createTxUpdateDoc<Card>(CHANGE_TYPE, CHANGE_SPACE, id, update)
}

type PlanFields = Pick<ChangeFields, 'servoneRisk' | 'servoneTypeKeys' | 'servoneInverse' | 'servoneDiff'>

function planFields (draft: Plan): PlanFields {
  return {
    servoneRisk: draft.risk,
    servoneTypeKeys: draft.typeKeys,
    servoneInverse: JSON.stringify(draft.inverse),
    servoneDiff: JSON.stringify(draft.diff)
  }
}

export async function writeChange (session: ConfigSession, draft: Plan, status: ChangeStatus, undoOf?: ChangeId): Promise<ChangeRecord> {
  await ensureChangeLog(session)
  const factory = new TxFactory(session.account.primarySocialId)
  const fields: ChangeFields = {
    ...planFields(draft),
    servoneStatus: status,
    servoneAuthor: session.account.primarySocialId,
    servoneOps: JSON.stringify(draft.ops),
    servoneModelVersion: draft.modelVersion
  }
  if (undoOf !== undefined) fields.servoneUndoOf = undoOf
  const base: Data<Card> = { title: draft.summary, content: EMPTY_CONTENT, blobs: {}, parentInfo: [], rank: '' }
  const id = generateId<Card>()
  await session.client.tx(factory.createTxCreateDoc<Card>(CHANGE_TYPE, CHANGE_SPACE, Object.assign(base, fields), id))
  return await readChange(session, id)
}

function corrupt (change: Card, field: string): ConfigError {
  return new ConfigError('failed', `Bản ghi thay đổi ${change._id} bị hỏng ở trường ${field}`)
}

function optionalText (change: Card, field: keyof ChangeFields): string | undefined {
  const raw: unknown = Reflect.get(change, field)
  return typeof raw === 'string' ? raw : undefined
}

function requiredText (change: Card, field: keyof ChangeFields): string {
  const text = optionalText(change, field)
  if (text === undefined) throw corrupt(change, field)
  return text
}

function storedOps (change: Card, field: 'servoneOps' | 'servoneInverse'): Operation[] {
  const parsed = parseOperationsJson(requiredText(change, field))
  if (parsed.issues.length > 0) throw corrupt(change, field)
  return parsed.ops
}

function storedDiff (change: Card): DiffLine[] {
  let parsed: Json
  try {
    parsed = JSON.parse(requiredText(change, 'servoneDiff'))
  } catch (error) {
    if (error instanceof SyntaxError) throw corrupt(change, 'servoneDiff')
    throw error
  }
  if (!Array.isArray(parsed)) throw corrupt(change, 'servoneDiff')
  return parsed.map((entry) => {
    if (!isJsonObject(entry)) throw corrupt(change, 'servoneDiff')
    const reader = new JsonReader(entry)
    const text = reader.string('text')
    const riskText = reader.string('risk')
    const risk = RISKS.find((it) => it === riskText)
    const affected = reader.optionalNumber('affected')
    if (reader.problems.length > 0 || risk === undefined) throw corrupt(change, 'servoneDiff')
    const diffLine: DiffLine = { text, risk }
    if (affected !== undefined) diffLine.affected = affected
    return diffLine
  })
}

function storedTypeKeys (change: Card): string[] {
  const raw: unknown = Reflect.get(change, 'servoneTypeKeys')
  if (!Array.isArray(raw)) throw corrupt(change, 'servoneTypeKeys')
  return raw.filter((it): it is string => typeof it === 'string')
}

export function parseChange (change: Card): ChangeRecord {
  const statusText = requiredText(change, 'servoneStatus')
  const status = STATUSES.find((it) => it === statusText)
  if (status === undefined) throw corrupt(change, 'servoneStatus')
  const riskText = requiredText(change, 'servoneRisk')
  const risk = RISKS.find((it) => it === riskText)
  if (risk === undefined) throw corrupt(change, 'servoneRisk')
  // The server sets createdBy for normal clients, but a raw client can forge it: the self-approval check is advisory on a stock server.
  if (change.createdBy === undefined) throw corrupt(change, 'createdBy')
  const record: ChangeRecord = {
    id: change._id,
    summary: change.title,
    status,
    risk,
    ops: storedOps(change, 'servoneOps'),
    inverse: storedOps(change, 'servoneInverse'),
    diff: storedDiff(change),
    typeKeys: storedTypeKeys(change),
    author: change.createdBy,
    modelVersion: requiredText(change, 'servoneModelVersion'),
    createdOn: change.createdOn ?? change.modifiedOn
  }
  const approver = optionalText(change, 'servoneApprover')
  if (approver !== undefined) record.approver = toPersonId(approver)
  const undoOf = optionalText(change, 'servoneUndoOf')
  if (undoOf !== undefined) record.undoOf = toRef(undoOf)
  return record
}

export async function readChange (session: ConfigSession, id: ChangeId): Promise<ChangeRecord> {
  const [type] = await session.client.findAll(card.class.MasterTag, { _id: CHANGE_TYPE })
  if (type !== undefined) await joinExistingChangeLog(session)
  const [change] = type !== undefined ? await session.client.findAll<Card>(CHANGE_TYPE, { _id: id }) : []
  if (change === undefined) throw new ConfigError('not-found', `Không tìm thấy thay đổi "${id}"`)
  return parseChange(change)
}

export async function findOpenUndo (session: ConfigSession, undoOf: ChangeId): Promise<ChangeRecord | undefined> {
  const [open] = await session.client.findAll<Card>(CHANGE_TYPE, { servoneUndoOf: undoOf, servoneStatus: { $in: ['draft', 'pending'] } })
  return open !== undefined ? parseChange(open) : undefined
}

export async function findChanges (session: ConfigSession, filter: ChangeFilter): Promise<ChangeRecord[]> {
  const [type] = await session.client.findAll(card.class.MasterTag, { _id: CHANGE_TYPE })
  if (type === undefined) return []
  await joinExistingChangeLog(session)
  const query: DocumentQuery<Card> = {}
  if (filter.status !== undefined) query.servoneStatus = filter.status
  // An array field matches a scalar query by containment.
  if (filter.type !== undefined) query.servoneTypeKeys = filter.type
  const found = await session.client.findAll(CHANGE_TYPE, query, {
    sort: { createdOn: SortingOrder.Descending },
    limit: filter.limit ?? DEFAULT_CHANGE_LIMIT
  })
  return found.map(parseChange)
}
