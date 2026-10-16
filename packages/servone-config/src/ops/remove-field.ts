import core, { type Doc, type TxCUD } from '@hcengineering/core'
import { ruleNames, ruleUsesOf } from '../automation-validate'
import { countRecords, enumRefOf, fieldKindOf, fieldScope, identifierOf, isFieldKind } from '../fields'
import { labelText } from '../keys'
import type { OperationModule } from '../registry'
import { readServone } from '../servone-fields'
import { countedLine, fieldIssues, issue, line, mustField, mustOwner, quote } from './common'

export const removeField: OperationModule<'removeField'> = {
  parse: (input) => ({ op: 'removeField', type: input.string('type'), field: input.string('field') }),
  validate: (op, { state }) => {
    const issues = fieldIssues(state, op.type, op.field)
    if (issues.length > 0) return issues
    const attr = mustField(state, mustOwner(state, op.type), op.field)
    if (attr.isCustom !== true) return [issue('system-protected', `Không xóa được trường có sẵn ${quote(labelText(attr.label))}`)]
    if (!isFieldKind(fieldKindOf(attr, state))) {
      return [issue('unsupported', `Trường ${quote(labelText(attr.label))} được tạo ngoài Studio; hãy xóa trong cài đặt cũ`)]
    }
    const uses = ruleUsesOf(state, attr)
    if (uses.length > 0) {
      return [issue('not-allowed', `Trường ${quote(labelText(attr.label))} đang được dùng trong quy tắc ${ruleNames(uses)}`)]
    }
    return []
  },
  measure: async (op, { state, client }) => {
    const attr = mustField(state, mustOwner(state, op.type), op.field)
    const scope = fieldScope(state, attr)
    return await countRecords(client, scope.types, { [scope.path]: { $exists: true } })
  },
  inverse: (op, { state }) => {
    const attr = mustField(state, mustOwner(state, op.type), op.field)
    const kind = fieldKindOf(attr, state)
    if (!isFieldKind(kind)) return []
    return [
      {
        op: 'restoreField',
        type: op.type,
        key: state.fieldKey(attr),
        name: labelText(attr.label),
        kind,
        required: attr.required === true,
        attributeId: attr._id,
        attributeName: attr.name,
        enumId: enumRefOf(attr),
        sequenceId: identifierOf(attr),
        packKey: readServone(attr).servonePackKey
      }
    ]
  },
  diff: (op, { state }, affected) => {
    const owner = mustOwner(state, op.type)
    const text = `Xóa trường ${quote(labelText(mustField(state, owner, op.field).label))} khỏi ${quote(state.nameOf(owner))}`
    return affected > 0
      ? [countedLine(`${text}: ${affected} hồ sơ đang có giá trị ở trường này`, 'destructive', affected)]
      : [line(`${text} (chưa có dữ liệu)`)]
  },
  risk: (op, ctx, affected) => (affected > 0 ? 'destructive' : 'safe'),
  expand: (op, { state, factory }) => {
    const attr = mustField(state, mustOwner(state, op.type), op.field)
    const txes: Array<TxCUD<Doc>> = [factory.createTxRemoveDoc(core.class.Attribute, core.space.Model, attr._id)]
    const enumId = enumRefOf(attr)
    const owned = enumId !== undefined ? state.enumById(enumId) : undefined
    if (owned !== undefined && readServone(owned).servoneOwnerField === attr._id) {
      txes.push(factory.createTxRemoveDoc(core.class.Enum, core.space.Model, owned._id))
    }
    return txes
  },
  typeKeys: (op) => [op.type]
}
