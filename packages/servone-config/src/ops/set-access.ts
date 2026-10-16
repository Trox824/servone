import card, { type CardSpace, type MasterTag, type Role } from '@hcengineering/card'
import core, {
  type ClassPermission,
  type Data,
  type Doc,
  type DocumentUpdate,
  generateId,
  type MixinUpdate,
  type Permission,
  type Ref,
  type Space,
  type TxCUD
} from '@hcengineering/core'
import { CARD_PERMISSION_ADD_TAG, CARD_PERMISSION_REMOVE_TAG } from '../ids'
import type { JsonReader } from '../json'
import { toAccountUuid, toLabel, toRef } from '../keys'
import type { AccessPreset, SetAccessOp, SpaceAccess } from '../operations'
import type { OperationModule, StepContext } from '../registry'
import { ACCESS_PRESETS, withServone } from '../servone-fields'
import type { DiffLine } from '../types'
import { activeTypeIssues, issue, line, mustSpace, mustType, quote, spaceIssues } from './common'

export const PRESET_LABEL: Record<AccessPreset, string> = {
  viewer: 'Người xem',
  editor: 'Người nhập',
  manager: 'Người quản lý'
}

type PermissionKind = 'create' | 'update' | 'remove'

const PRESET_PERMISSIONS: Record<AccessPreset, PermissionKind[]> = {
  viewer: [],
  editor: ['create', 'update'],
  manager: ['create', 'update', 'remove']
}

const PERMISSION_SUFFIX: Record<PermissionKind, string> = {
  create: 'create_allowed',
  update: 'allowed',
  remove: 'remove_allowed'
}

const PERMISSION_LABEL: Record<PermissionKind, string> = {
  create: 'Tạo hồ sơ',
  update: 'Sửa hồ sơ',
  remove: 'Xóa hồ sơ'
}

// Ids from createTypePermissions in plugins/card-resources/src/utils.ts, so Huly's role editor shows them.
function permissionId (type: MasterTag, kind: PermissionKind): Ref<ClassPermission> {
  return toRef(`${type._id}_${PERMISSION_SUFFIX[kind]}`)
}

export function permissionsFor (type: MasterTag, preset: AccessPreset): Array<Ref<Permission>> {
  const own = PRESET_PERMISSIONS[preset].map((kind) => permissionId(type, kind))
  return preset === 'manager' ? [...own, CARD_PERMISSION_ADD_TAG, CARD_PERMISSION_REMOVE_TAG] : own
}

function permissionData (type: MasterTag, kind: PermissionKind): Data<ClassPermission> {
  const base: Data<ClassPermission> = {
    objectClass: type._id,
    targetClass: type._id,
    txClass: core.class.TxCreateDoc,
    scope: 'space',
    forbid: false,
    label: toLabel(PERMISSION_LABEL[kind]),
    description: type.label
  }
  if (kind === 'update') {
    base.txClass = core.class.TxUpdateDoc
    base.txMatch = { objectClass: type._id }
  }
  if (kind === 'remove') base.txClass = core.class.TxRemoveDoc
  return base
}

function parseSpaceAccess (input: JsonReader): SpaceAccess {
  const people = (preset: AccessPreset): SpaceAccess[AccessPreset] => input.optionalStringArray(preset)?.map(toAccountUuid)
  return {
    space: input.string('space'),
    isRestricted: input.optionalBoolean('isRestricted'),
    viewer: people('viewer'),
    editor: people('editor'),
    manager: people('manager')
  }
}

function usedPresets (op: SetAccessOp): AccessPreset[] {
  return ACCESS_PRESETS.filter((preset) => op.access.spaces.some((it) => it[preset] !== undefined))
}

// Same wrapping as TxOperations.addCollection, so the server keeps the SpaceType roles counter.
function inRoles (ctx: StepContext, tx: TxCUD<Role>): TxCUD<Role> {
  return ctx.factory.createTxCollectionCUD(core.class.SpaceType, card.spaceType.SpaceType, core.space.Model, 'roles', tx)
}

function roleTxes (ctx: StepContext, type: MasterTag, preset: AccessPreset): { role: Ref<Role>, txes: Array<TxCUD<Role>> } {
  const permissions = permissionsFor(type, preset)
  const existing = ctx.state.roleFor(type._id, preset)
  if (existing !== undefined) {
    const isCurrent = existing.permissions.length === permissions.length && permissions.every((it) => existing.permissions.includes(it))
    if (isCurrent) return { role: existing._id, txes: [] }
    const update = ctx.factory.createTxUpdateDoc<Role>(card.class.Role, core.space.Model, existing._id, { permissions })
    return { role: existing._id, txes: [inRoles(ctx, update)] }
  }
  const role = generateId<Role>()
  const base: Data<Role> = {
    attachedTo: card.spaceType.SpaceType,
    attachedToClass: core.class.SpaceType,
    collection: 'roles',
    name: `${PRESET_LABEL[preset]} · ${ctx.state.nameOf(type)}`,
    types: [type._id],
    permissions
  }
  const create = ctx.factory.createTxCreateDoc<Role>(card.class.Role, core.space.Model, withServone(base, { servonePreset: preset }), role)
  return { role, txes: [inRoles(ctx, create)] }
}

export const setAccess: OperationModule<'setAccess'> = {
  parse: (input) => ({
    op: 'setAccess',
    type: input.string('type'),
    access: { spaces: input.object('access').objects('spaces').map(parseSpaceAccess) }
  }),
  validate: (op, { state }) => {
    const group = state.resolveType(op.type) === undefined ? state.resolveGroup(op.type) : undefined
    if (group !== undefined) return [issue('unsupported', 'Quyền chỉ đặt được cho biểu mẫu, không cho nhóm trường')]
    const issues = activeTypeIssues(state, op.type)
    if (issues.length > 0) return issues
    if (op.access.spaces.length === 0) return [issue('invalid-input', 'Cần ít nhất một không gian')]
    issues.push(...spaceIssues(state, op.access.spaces.map((it) => it.space)))
    const ids = op.access.spaces.flatMap((it) => state.resolveSpace(it.space)?._id ?? [])
    if (new Set(ids).size !== ids.length) issues.push(issue('invalid-input', 'Một không gian được nêu hai lần'))
    for (const access of op.access.spaces) {
      const hasChange = access.isRestricted !== undefined || ACCESS_PRESETS.some((preset) => access[preset] !== undefined)
      if (!hasChange) issues.push(issue('invalid-input', `Không có thay đổi quyền cho không gian "${access.space}"`))
    }
    return issues
  },
  inverse: (op, { state }) => {
    const type = mustType(state, op.type)
    const spaces = op.access.spaces.map((access): SpaceAccess => {
      const space = mustSpace(state, access.space)
      const previous: SpaceAccess = { space: space._id, isRestricted: space.restricted === true }
      for (const preset of ACCESS_PRESETS) {
        if (access[preset] === undefined) continue
        const role = state.roleFor(type._id, preset)
        previous[preset] = role !== undefined ? state.assignment(space, role._id) : []
      }
      return previous
    })
    return [{ op: 'setAccess', type: op.type, access: { spaces } }]
  },
  diff: (op, { state }) => {
    const type = mustType(state, op.type)
    const name = quote(state.nameOf(type))
    const lines: DiffLine[] = []
    for (const preset of usedPresets(op)) {
      if (state.roleFor(type._id, preset) === undefined) {
        lines.push(line(`Tạo vai trò ${quote(PRESET_LABEL[preset])} cho ${name}`, 'sensitive'))
      }
    }
    for (const access of op.access.spaces) {
      const space = mustSpace(state, access.space)
      const counts = ACCESS_PRESETS.flatMap((preset) => {
        const people = access[preset]
        return people !== undefined ? [`${PRESET_LABEL[preset]}: ${people.length} người`] : []
      })
      if (counts.length > 0) lines.push(line(`Quyền với ${name} trong ${quote(space.name)}: ${counts.join(', ')}`, 'sensitive'))
      const isRestricted = access.isRestricted ?? true
      if (isRestricted !== (space.restricted === true)) {
        const text = isRestricted
          ? `${quote(space.name)} chỉ cho người được cấp quyền thao tác`
          : `${quote(space.name)} bỏ giới hạn quyền, mọi thành viên thao tác được`
        lines.push(line(text, 'sensitive'))
      }
    }
    return lines
  },
  risk: () => 'sensitive',
  expand: (op, ctx) => {
    const { state, factory } = ctx
    const type = mustType(state, op.type)
    const used = usedPresets(op)
    const txes: Array<TxCUD<Doc>> = []
    for (const kind of new Set(used.flatMap((preset) => PRESET_PERMISSIONS[preset]))) {
      const id = permissionId(type, kind)
      if (state.permission(id) === undefined) {
        txes.push(factory.createTxCreateDoc(core.class.ClassPermission, core.space.Model, permissionData(type, kind), id))
      }
    }
    const roles = new Map<AccessPreset, Ref<Role>>()
    for (const preset of used) {
      const planned = roleTxes(ctx, type, preset)
      roles.set(preset, planned.role)
      txes.push(...planned.txes)
    }
    for (const access of op.access.spaces) {
      const space = mustSpace(state, access.space)
      const update: DocumentUpdate<CardSpace> = {}
      // Restricted spaces require a role permission for every card transaction.
      const isRestricted = access.isRestricted ?? true
      if (isRestricted !== (space.restricted === true)) update.restricted = isRestricted
      if (!space.types.includes(type._id)) update.types = [...space.types, type._id]
      if (Object.keys(update).length > 0) txes.push(factory.createTxUpdateDoc(card.class.CardSpace, space.space, space._id, update))
      const assignment: MixinUpdate<Space, Space> = {}
      for (const preset of ACCESS_PRESETS) {
        const people = access[preset]
        const role = roles.get(preset)
        if (people !== undefined && role !== undefined) Object.assign(assignment, { [role]: people })
      }
      if (Object.keys(assignment).length > 0) {
        txes.push(factory.createTxMixin<Space, Space>(space._id, card.class.CardSpace, space.space, core.mixin.SpacesTypeData, assignment))
      }
    }
    return txes
  },
  typeKeys: (op) => [op.type]
}
