import card, { type CardSpace, type MasterTag, type Role, type Tag } from '@hcengineering/card'
import core, {
  type AccountUuid,
  type AnyAttribute,
  type Association,
  type Class,
  type ClassPermission,
  type CustomSequence,
  type Doc,
  type Enum,
  type Obj,
  type Permission,
  type Ref,
  type Tx,
  type TxCreateDoc,
  type TxMixin,
  TxProcessor,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import process, { type Process, type State, type Transition } from '@hcengineering/process'
import setting from '@hcengineering/setting'
import view, { type Viewlet, type ViewletDescriptor } from '@hcengineering/view'
import type { ConfigClient } from './client'
import { enumRefOf } from './fields'
import { CHANGE_SPACE, CHANGE_TYPE } from './ids'
import { labelText, sameName } from './keys'
import type { AccessPreset } from './operations'
import { readServone } from './servone-fields'

const isMasterTag = (doc: Doc): doc is MasterTag => doc._class === card.class.MasterTag
const isTag = (doc: Doc): doc is Tag => doc._class === card.class.Tag
const isAttribute = (doc: Doc): doc is AnyAttribute => doc._class === core.class.Attribute
const isEnum = (doc: Doc): doc is Enum => doc._class === core.class.Enum
const isAssociation = (doc: Doc): doc is Association => doc._class === core.class.Association
const isCardSpace = (doc: Doc): doc is CardSpace => doc._class === card.class.CardSpace
const isRole = (doc: Doc): doc is Role => doc._class === card.class.Role
const isSequence = (doc: Doc): doc is CustomSequence => doc._class === core.class.CustomSequence
const isViewlet = (doc: Doc): doc is Viewlet => doc._class === view.class.Viewlet
const isClassPermission = (doc: Doc): doc is ClassPermission => doc._class === core.class.ClassPermission
const isProcess = (doc: Doc): doc is Process => doc._class === process.class.Process
const isState = (doc: Doc): doc is State => doc._class === process.class.State
const isTransition = (doc: Doc): doc is Transition => doc._class === process.class.Transition

const isCreate = (tx: Tx): tx is TxCreateDoc<Doc> => tx._class === core.class.TxCreateDoc
const isUpdate = (tx: Tx): tx is TxUpdateDoc<Doc> => tx._class === core.class.TxUpdateDoc
const isRemove = (tx: Tx): tx is TxRemoveDoc<Doc> => tx._class === core.class.TxRemoveDoc
const isMixin = (tx: Tx): tx is TxMixin<Doc, Doc> => tx._class === core.class.TxMixin

// Space membership and sequence counters change during normal work; drafts must not go stale on them.
const isChurn = (doc: Doc): boolean => isCardSpace(doc) || isSequence(doc)

// FNV-1a: stable in browser and Node without a crypto dependency.
const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
// Mixed in between parts so ["ab", "c"] and ["a", "bc"] hash differently.
const PART_SEPARATOR = 0x7c

function fingerprint (parts: string[]): string {
  let hash = FNV_OFFSET
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      hash ^= part.charCodeAt(i)
      hash = Math.imul(hash, FNV_PRIME) >>> 0
    }
    hash ^= PART_SEPARATOR
  }
  return `${parts.length}-${hash.toString(16).padStart(8, '0')}`
}

function isChangeLogDoc (doc: Doc): boolean {
  if (doc._id === CHANGE_TYPE || doc._id === CHANGE_SPACE) return true
  if (isAttribute(doc)) return doc.attributeOf === CHANGE_TYPE
  if (isViewlet(doc)) return doc.attachTo === CHANGE_TYPE
  return false
}

// createSystemType marks built-in types Editable=false; the server marks user-created types true.
export function isLockedType (type: MasterTag): boolean {
  const editable: unknown = Reflect.get(type, setting.mixin.Editable)
  return typeof editable === 'object' && editable !== null && Reflect.get(editable, 'value') === false
}

// The server's syncContext rewrites Process.context after every rule save; the stored rule text is what core owns.
function versionPart (doc: Doc): string {
  if (isProcess(doc)) return `${doc._id}#${readServone(doc).servoneRule ?? doc.modifiedOn}`
  return `${doc._id}@${doc.modifiedOn}`
}

export class ModelState {
  private readonly docs = new Map<Ref<Doc>, Doc>()
  // Later ops validate and measure against the live DB, which has not seen earlier ops of the same plan.
  private readonly touched = new Set<Ref<Doc>>()
  private readonly created = new Set<Ref<Doc>>()
  private recordWriteCount = 0

  constructor (docs: Doc[]) {
    for (const doc of docs) this.docs.set(doc._id, doc)
  }

  private list<T extends Doc> (guard: (doc: Doc) => doc is T): T[] {
    const found: T[] = []
    for (const doc of this.docs.values()) if (guard(doc)) found.push(doc)
    return found
  }

  get (id: Ref<Doc>): Doc | undefined {
    return this.docs.get(id)
  }

  types (): MasterTag[] {
    return this.list(isMasterTag).filter((it) => it.removed !== true)
  }

  activeTypes (): MasterTag[] {
    return this.types().filter((it) => !this.isArchived(it))
  }

  groups (): Tag[] {
    return this.list(isTag)
  }

  links (): Association[] {
    return this.list(isAssociation)
  }

  spaces (): CardSpace[] {
    return this.list(isCardSpace)
  }

  activeSpaces (): CardSpace[] {
    return this.spaces().filter((it) => !it.archived)
  }

  roles (): Role[] {
    return this.list(isRole)
  }

  sequences (): CustomSequence[] {
    return this.list(isSequence)
  }

  fieldsOf (owner: Ref<Class<Obj>>): AnyAttribute[] {
    return this.list(isAttribute).filter((it) => it.attributeOf === owner)
  }

  fieldsWithInherited (owner: Ref<Class<Obj>>): AnyAttribute[] {
    const found: AnyAttribute[] = []
    let current: Ref<Class<Obj>> | undefined = owner
    while (current !== undefined) {
      found.push(...this.fieldsOf(current))
      const doc = this.docs.get(current)
      current = doc !== undefined && isMasterTag(doc) ? doc.extends : undefined
    }
    return found
  }

  enumById (id: Ref<Enum>): Enum | undefined {
    const doc = this.docs.get(id)
    return doc !== undefined && isEnum(doc) ? doc : undefined
  }

  sequence (id: Ref<CustomSequence>): CustomSequence | undefined {
    const doc = this.docs.get(id)
    return doc !== undefined && isSequence(doc) ? doc : undefined
  }

  permission (id: Ref<Permission>): ClassPermission | undefined {
    const doc = this.docs.get(id)
    return doc !== undefined && isClassPermission(doc) ? doc : undefined
  }

  viewlet (type: Ref<MasterTag>, descriptor: Ref<ViewletDescriptor>): Viewlet | undefined {
    return this.list(isViewlet).find((it) => it.attachTo === type && it.descriptor === descriptor && it.variant === undefined)
  }

  keyOf (doc: Doc): string {
    return readServone(doc).servoneKey ?? doc._id
  }

  fieldKey (attr: AnyAttribute): string {
    return readServone(attr).servoneKey ?? attr.name
  }

  ownerKey (id: Ref<Class<Obj>>): string {
    const doc = this.docs.get(id)
    return doc !== undefined ? this.keyOf(doc) : id
  }

  isKeyTaken (key: string): boolean {
    return [...this.types(), ...this.groups()].some((it) => this.keyOf(it) === key)
  }

  resolveType (key: string): MasterTag | undefined {
    return this.types().find((it) => this.keyOf(it) === key)
  }

  resolveGroup (key: string): Tag | undefined {
    return this.groups().find((it) => this.keyOf(it) === key)
  }

  resolveOwner (key: string): MasterTag | Tag | undefined {
    return this.resolveType(key) ?? this.resolveGroup(key)
  }

  resolveField (owner: MasterTag | Tag, key: string): AnyAttribute | undefined {
    return this.fieldsWithInherited(owner._id).find((it) => this.fieldKey(it) === key)
  }

  resolveLink (key: string): Association | undefined {
    return this.links().find((it) => this.keyOf(it) === key)
  }

  resolveSpace (ref: string): CardSpace | undefined {
    return this.spaces().find((it) => it._id === ref) ?? this.spaces().find((it) => sameName(it.name, ref))
  }

  isSystem (type: MasterTag): boolean {
    return isLockedType(type)
  }

  isArchived (type: MasterTag | Tag): boolean {
    return readServone(type).servoneArchived === true
  }

  nameOf (doc: MasterTag | Tag): string {
    return labelText(doc.label)
  }

  descendantsOf (id: Ref<MasterTag>): Array<Ref<MasterTag>> {
    const found: Array<Ref<MasterTag>> = [id]
    for (let i = 0; i < found.length; i++) {
      for (const type of this.types()) {
        if (type.extends === found[i] && !found.includes(type._id)) found.push(type._id)
      }
    }
    return found
  }

  spacesOf (type: Ref<MasterTag>): CardSpace[] {
    return this.spaces().filter((it) => it.types.includes(type))
  }

  roleFor (type: Ref<MasterTag>, preset: AccessPreset): Role | undefined {
    return this.roles().find((it) => it.types.includes(type) && readServone(it).servonePreset === preset)
  }

  assignment (space: CardSpace, role: Ref<Role>): AccountUuid[] {
    const assigned: unknown = Reflect.get(space, core.mixin.SpacesTypeData)
    if (typeof assigned !== 'object' || assigned === null) return []
    const people: unknown = Reflect.get(assigned, role)
    return Array.isArray(people) ? people.filter((it): it is AccountUuid => typeof it === 'string') : []
  }

  processesOf (type: Ref<MasterTag>): Process[] {
    return this.list(isProcess).filter((it) => it.masterTag === type)
  }

  resolveRule (type: Ref<MasterTag>, key: string): Process | undefined {
    return this.processesOf(type).find((it) => this.keyOf(it) === key)
  }

  statesOf (rule: Ref<Process>): State[] {
    return this.list(isState).filter((it) => it.process === rule)
  }

  transitionsOf (rule: Ref<Process>): Transition[] {
    return this.list(isTransition).filter((it) => it.process === rule)
  }

  version (): string {
    const parts = [...this.docs.values()]
      .filter((doc) => !isChurn(doc))
      .map((doc) => versionPart(doc))
      .sort()
    return fingerprint(parts)
  }

  wasTouched (id: Ref<Doc>): boolean {
    return this.touched.has(id)
  }

  wasCreated (id: Ref<Doc>): boolean {
    return this.created.has(id)
  }

  recordWrites (): number {
    return this.recordWriteCount
  }

  apply (txes: Tx[]): void {
    for (const tx of txes) {
      if (isCreate(tx)) {
        this.docs.set(tx.objectId, TxProcessor.createDoc2Doc(tx))
        this.created.add(tx.objectId)
        this.touched.add(tx.objectId)
        continue
      }
      if (isRemove(tx)) {
        this.docs.delete(tx.objectId)
        this.touched.add(tx.objectId)
        continue
      }
      if (!isUpdate(tx) && !isMixin(tx)) continue
      // Option remaps update cards, which the state does not hold.
      const doc = this.docs.get(tx.objectId)
      if (doc === undefined) {
        this.recordWriteCount++
        continue
      }
      this.touched.add(tx.objectId)
      if (isUpdate(tx)) TxProcessor.updateDoc2Doc(doc, tx)
      if (isMixin(tx)) TxProcessor.updateMixin4Doc(doc, tx)
    }
  }
}

export async function loadState (client: ConfigClient): Promise<ModelState> {
  const [types, groups, links, spaces, roles, sequences] = await Promise.all([
    client.findAll(card.class.MasterTag, {}),
    client.findAll(card.class.Tag, {}),
    client.findAll(core.class.Association, {}),
    client.findAll(card.class.CardSpace, {}),
    client.findAll(card.class.Role, {}),
    client.findAll(core.class.CustomSequence, {})
  ])
  const owners: Array<Ref<Class<Obj>>> = [...types, ...groups].map((it) => it._id)
  const ruleOwners: Array<Ref<MasterTag | Tag>> = [...types, ...groups].map((it) => it._id)
  const [fields, viewlets, permissions, rules] = await Promise.all([
    client.findAll(core.class.Attribute, { attributeOf: { $in: owners } }),
    client.findAll(view.class.Viewlet, { attachTo: { $in: owners } }),
    client.findAll(core.class.ClassPermission, { targetClass: { $in: owners } }),
    client.findAll(process.class.Process, { masterTag: { $in: ruleOwners } })
  ])
  const ruleIds = rules.map((it) => it._id)
  const [ruleStates, ruleTransitions] =
    ruleIds.length > 0
      ? await Promise.all([
        client.findAll(process.class.State, { process: { $in: ruleIds } }),
        client.findAll(process.class.Transition, { process: { $in: ruleIds } })
      ])
      : [[], []]
  const enumIds = fields.flatMap((it) => {
    const id = enumRefOf(it)
    return id !== undefined ? [id] : []
  })
  const enums = enumIds.length > 0 ? await client.findAll(core.class.Enum, { _id: { $in: enumIds } }) : []
  const docs: Doc[] = [
    ...types,
    ...groups,
    ...links,
    ...spaces,
    ...roles,
    ...sequences,
    ...fields,
    ...viewlets,
    ...permissions,
    ...enums,
    ...rules,
    ...ruleStates,
    ...ruleTransitions
  ]
  return new ModelState(docs.filter((doc) => !isChangeLogDoc(doc)))
}
