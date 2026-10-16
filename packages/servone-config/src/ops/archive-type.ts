import card, { type MasterTag } from '@hcengineering/card'
import core, { type DocumentUpdate } from '@hcengineering/core'
import { countRecords } from '../fields'
import type { OperationModule } from '../registry'
import { withServone } from '../servone-fields'
import { activeTypeIssues, countedLine, issue, line, mustType, quote, typeNameIssues } from './common'

// Never `removed: true`: the server's OnMasterTagRemove trigger deletes every card of the type.
function archivedUpdate (isArchived: boolean): DocumentUpdate<MasterTag> {
  const update: DocumentUpdate<MasterTag> = {}
  return withServone(update, { servoneArchived: isArchived })
}

export const archiveType: OperationModule<'archiveType'> = {
  parse: (input) => ({ op: 'archiveType', type: input.string('type') }),
  validate: (op, { state }) => {
    const issues = activeTypeIssues(state, op.type)
    if (issues.length > 0) return issues
    const type = mustType(state, op.type)
    if (state.isSystem(type)) {
      return [issue('system-protected', `${quote(state.nameOf(type))} là loại hệ thống, không lưu trữ được`)]
    }
    const children = state.activeTypes().filter((it) => it.extends === type._id)
    if (children.length > 0) {
      const names = children.map((it) => quote(state.nameOf(it))).join(', ')
      return [issue('not-allowed', `Còn loại con đang dùng: ${names}; hãy lưu trữ chúng trước`)]
    }
    return []
  },
  measure: async (op, { state, client }) => {
    const type = mustType(state, op.type)
    return await countRecords(client, state.descendantsOf(type._id), {})
  },
  inverse: (op) => [{ op: 'unarchiveType', type: op.type }],
  diff: (op, { state }, affected) => [
    countedLine(
      `Lưu trữ biểu mẫu ${quote(state.nameOf(mustType(state, op.type)))}: ${affected} hồ sơ được giữ lại nhưng không tạo thêm được`,
      'destructive',
      affected
    )
  ],
  risk: () => 'destructive',
  expand: (op, { state, factory }) => [
    factory.createTxUpdateDoc(card.class.MasterTag, core.space.Model, mustType(state, op.type)._id, archivedUpdate(true))
  ],
  typeKeys: (op) => [op.type]
}

export const unarchiveType: OperationModule<'unarchiveType'> = {
  parse: (input) => ({ op: 'unarchiveType', type: input.string('type') }),
  validate: (op, { state }) => {
    const type = state.resolveType(op.type)
    if (type === undefined) return [issue('not-found', `Không tìm thấy biểu mẫu "${op.type}"`)]
    if (!state.isArchived(type)) return [issue('not-allowed', `${quote(state.nameOf(type))} chưa bị lưu trữ`)]
    // Archiving frees the name, so an active type may have taken it since.
    return typeNameIssues(state, state.nameOf(type), type._id).filter((it) => it.code === 'duplicate-name')
  },
  inverse: (op) => [{ op: 'archiveType', type: op.type }],
  diff: (op, { state }) => [line(`Khôi phục biểu mẫu ${quote(state.nameOf(mustType(state, op.type)))}`)],
  risk: () => 'safe',
  expand: (op, { state, factory }) => [
    factory.createTxUpdateDoc(card.class.MasterTag, core.space.Model, mustType(state, op.type)._id, archivedUpdate(false))
  ],
  typeKeys: (op) => [op.type]
}
