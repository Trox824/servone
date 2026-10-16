import card, { type MasterTag } from '@hcengineering/card'
import core, { ClassifierKind, type Data, type Doc, generateId, type TxCUD } from '@hcengineering/core'
import { toLabel } from '../keys'
import type { CreateTypeOp, UnarchiveTypeOp } from '../operations'
import type { OperationModule } from '../registry'
import { keyFields, withServone } from '../servone-fields'
import type { ModelState } from '../state'
import { unarchiveType } from './archive-type'
import {
  activeTypeIssues,
  colorFor,
  isPackInstalled,
  line,
  newKeyIssues,
  quote,
  spaceIssues,
  targetSpaces,
  typeNameIssues
} from './common'

// Undoing a pack install archives its types; installing that pack again brings them back instead of refusing the key.
function restoreOf (op: CreateTypeOp, state: ModelState): UnarchiveTypeOp | undefined {
  const type = state.resolveType(op.key)
  if (type === undefined || !state.isArchived(type) || !isPackInstalled(type, op.packKey)) return undefined
  return { op: 'unarchiveType', type: op.key }
}

export const createType: OperationModule<'createType'> = {
  parse: (input) => ({
    op: 'createType',
    key: input.string('key'),
    name: input.string('name'),
    basedOn: input.optionalString('basedOn'),
    spaces: input.optionalStringArray('spaces'),
    packKey: input.optionalString('packKey')
  }),
  isInstalled: (op, { state }) => {
    const type = state.resolveType(op.key)
    return type !== undefined && isPackInstalled(type, op.packKey) && !state.isArchived(type)
  },
  validate: (op, ctx) => {
    const { state } = ctx
    const restore = restoreOf(op, state)
    if (restore !== undefined) return unarchiveType.validate(restore, ctx)
    const issues = [...newKeyIssues(state, op.key), ...typeNameIssues(state, op.name), ...spaceIssues(state, op.spaces ?? [])]
    if (op.basedOn !== undefined) issues.push(...activeTypeIssues(state, op.basedOn))
    return issues
  },
  inverse: (op) => [{ op: 'archiveType', type: op.key }],
  diff: (op, ctx, affected) => {
    const { state } = ctx
    const restore = restoreOf(op, state)
    if (restore !== undefined) return unarchiveType.diff(restore, ctx, affected)
    const names = targetSpaces(state, op.spaces).map((it) => it.name)
    const where = names.length > 0 ? `, hiện trong: ${names.join(', ')}` : ', chưa hiện trong không gian nào'
    return [line(`Tạo biểu mẫu ${quote(op.name.trim())}${where}`)]
  },
  risk: () => 'safe',
  expand: (op, ctx) => {
    const { state, factory } = ctx
    const restore = restoreOf(op, state)
    if (restore !== undefined) return unarchiveType.expand(restore, ctx)
    const id = generateId<MasterTag>()
    const parent = op.basedOn !== undefined ? state.resolveType(op.basedOn) : undefined
    const base: Data<MasterTag> = {
      extends: parent?._id ?? card.class.Card,
      label: toLabel(op.name),
      kind: ClassifierKind.CLASS,
      icon: card.icon.MasterTag,
      background: colorFor(op.name.trim())
    }
    const txes: Array<TxCUD<Doc>> = [
      factory.createTxCreateDoc(card.class.MasterTag, core.space.Model, withServone(base, keyFields(op.key, op.packKey)), id)
    ]
    for (const space of targetSpaces(state, op.spaces)) {
      txes.push(factory.createTxUpdateDoc(card.class.CardSpace, space.space, space._id, { types: [...space.types, id] }))
    }
    return txes
  },
  typeKeys: (op) => [op.key]
}
