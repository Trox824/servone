import card, { type MasterTag, type Tag } from '@hcengineering/card'
import core, { ClassifierKind, type Data, generateId } from '@hcengineering/core'
import { countRecords } from '../fields'
import { toLabel } from '../keys'
import type { OperationModule } from '../registry'
import { keyFields, readServone, withServone } from '../servone-fields'
import type { ModelState } from '../state'
import { activeTypeIssues, colorFor, countedLine, isPackInstalled, issue, line, mustType, nameIssues, newKeyIssues, quote } from './common'

function mustGroup (state: ModelState, key: string): Tag {
  const found = state.resolveGroup(key)
  if (found === undefined) throw new Error(`Group "${key}" disappeared after validation`)
  return found
}

function baseOf (state: ModelState, group: Tag): MasterTag | undefined {
  return state.types().find((it) => it._id === group.extends)
}

export const createGroup: OperationModule<'createGroup'> = {
  parse: (input) => ({
    op: 'createGroup',
    key: input.string('key'),
    name: input.string('name'),
    types: input.stringArray('types'),
    packKey: input.optionalString('packKey')
  }),
  isInstalled: (op, { state }) => isPackInstalled(state.resolveGroup(op.key), op.packKey),
  validate: (op, { state }) => {
    const issues = [...newKeyIssues(state, op.key), ...nameIssues(op.name, 'nhóm trường')]
    // A Tag is a mixin and extends exactly one class.
    if (op.types.length !== 1) return [...issues, issue('unsupported', 'Mỗi nhóm trường hiện chỉ gắn với một biểu mẫu')]
    issues.push(...activeTypeIssues(state, op.types[0]))
    return issues
  },
  inverse: (op) => [{ op: 'removeGroup', group: op.key }],
  diff: (op, { state }) => [
    line(`Tạo nhóm trường ${quote(op.name.trim())} cho ${quote(state.nameOf(mustType(state, op.types[0])))}`)
  ],
  risk: () => 'safe',
  expand: (op, { state, factory }) => {
    const base: Data<Tag> = {
      extends: mustType(state, op.types[0])._id,
      label: toLabel(op.name),
      kind: ClassifierKind.MIXIN,
      icon: card.icon.Tag,
      background: colorFor(op.name.trim())
    }
    return [factory.createTxCreateDoc(card.class.Tag, core.space.Model, withServone(base, keyFields(op.key, op.packKey)), generateId())]
  },
  typeKeys: (op) => op.types
}

export const removeGroup: OperationModule<'removeGroup'> = {
  parse: (input) => ({ op: 'removeGroup', group: input.string('group') }),
  validate: (op, { state }) => {
    const group = state.resolveGroup(op.group)
    if (group === undefined) return [issue('not-found', `Không tìm thấy nhóm trường "${op.group}"`)]
    if (state.fieldsOf(group._id).length > 0) {
      return [issue('not-allowed', `Nhóm trường ${quote(state.nameOf(group))} còn trường; hãy xóa các trường trước`)]
    }
    return []
  },
  measure: async (op, { state, client }) => {
    const group = mustGroup(state, op.group)
    const base = baseOf(state, group)
    if (base === undefined) return 0
    return await countRecords(client, state.descendantsOf(base._id), { [group._id]: { $exists: true } })
  },
  inverse: (op, { state }) => {
    const group = mustGroup(state, op.group)
    const base = baseOf(state, group)
    if (base === undefined) return []
    return [
      { op: 'createGroup', key: state.keyOf(group), name: state.nameOf(group), types: [state.keyOf(base)], packKey: readServone(group).servonePackKey }
    ]
  },
  diff: (op, { state }, affected) => {
    const text = `Xóa nhóm trường ${quote(state.nameOf(mustGroup(state, op.group)))}`
    if (affected === 0) return [line(text)]
    return [
      countedLine(`${text}: ${affected} hồ sơ đang gắn nhóm này`, 'destructive', affected),
      line('Hoàn tác chỉ tạo lại nhóm trống, không gắn lại vào các hồ sơ', 'destructive')
    ]
  },
  risk: (op, ctx, affected) => (affected > 0 ? 'destructive' : 'safe'),
  expand: (op, { state, factory }) => [factory.createTxRemoveDoc(card.class.Tag, core.space.Model, mustGroup(state, op.group)._id)],
  typeKeys: (op, { state }) => {
    const base = baseOf(state, mustGroup(state, op.group))
    return base !== undefined ? [state.keyOf(base)] : []
  }
}
