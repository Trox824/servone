import card, { type MasterTag } from '@hcengineering/card'
import core, { type Doc, type DocumentUpdate, type TxCUD } from '@hcengineering/core'
import { PALETTE_SIZE } from '../ids'
import { toAsset, toLabel } from '../keys'
import type { OperationModule } from '../registry'
import type { DiffLine } from '../types'
import { activeTypeIssues, issue, line, mustType, quote, spaceIssues, targetSpaces, typeNameIssues } from './common'

export const updateType: OperationModule<'updateType'> = {
  parse: (input) => ({
    op: 'updateType',
    type: input.string('type'),
    name: input.optionalString('name'),
    icon: input.optionalString('icon'),
    color: input.optionalNumber('color'),
    spaces: input.optionalStringArray('spaces')
  }),
  validate: (op, { state }) => {
    const issues = activeTypeIssues(state, op.type)
    if (issues.length > 0) return issues
    const type = mustType(state, op.type)
    if (op.name === undefined && op.icon === undefined && op.color === undefined && op.spaces === undefined) {
      issues.push(issue('invalid-input', 'Không có gì để đổi'))
    }
    if (op.name !== undefined) issues.push(...typeNameIssues(state, op.name, type._id))
    if (op.icon !== undefined && op.icon.trim().length === 0) issues.push(issue('invalid-input', 'Biểu tượng không được để trống'))
    const isColorValid = op.color === undefined || (Number.isInteger(op.color) && op.color >= 0 && op.color < PALETTE_SIZE)
    if (!isColorValid) issues.push(issue('invalid-input', `Màu phải là số nguyên từ 0 đến ${PALETTE_SIZE - 1}`))
    if (op.spaces !== undefined) issues.push(...spaceIssues(state, op.spaces))
    return issues
  },
  inverse: (op, { state }) => {
    const type = mustType(state, op.type)
    return [
      {
        op: 'updateType',
        type: op.type,
        name: op.name !== undefined ? state.nameOf(type) : undefined,
        icon: op.icon !== undefined ? (type.icon ?? card.icon.MasterTag) : undefined,
        color: op.color !== undefined ? (type.background ?? 0) : undefined,
        spaces: op.spaces !== undefined ? state.spacesOf(type._id).map((it) => it._id) : undefined
      }
    ]
  },
  diff: (op, { state }) => {
    const current = quote(state.nameOf(mustType(state, op.type)))
    const lines: DiffLine[] = []
    if (op.name !== undefined) lines.push(line(`Đổi tên biểu mẫu ${current} thành ${quote(op.name.trim())}`))
    if (op.icon !== undefined) lines.push(line(`Đổi biểu tượng của ${current}`))
    if (op.color !== undefined) lines.push(line(`Đổi màu của ${current}`))
    if (op.spaces !== undefined) {
      const names = targetSpaces(state, op.spaces).map((it) => it.name)
      lines.push(line(names.length > 0 ? `${current} hiện trong: ${names.join(', ')}` : `${current} không hiện trong không gian nào`))
    }
    return lines
  },
  risk: () => 'safe',
  expand: (op, { state, factory }) => {
    const type = mustType(state, op.type)
    const txes: Array<TxCUD<Doc>> = []
    const update: DocumentUpdate<MasterTag> = {}
    if (op.name !== undefined) update.label = toLabel(op.name)
    if (op.icon !== undefined) update.icon = toAsset(op.icon)
    if (op.color !== undefined) update.background = op.color
    if (Object.keys(update).length > 0) {
      txes.push(factory.createTxUpdateDoc(card.class.MasterTag, core.space.Model, type._id, update))
    }
    if (op.spaces !== undefined) {
      const wanted = new Set<string>(targetSpaces(state, op.spaces).map((it) => it._id))
      for (const space of state.spaces()) {
        const isListed = space.types.includes(type._id)
        if (isListed === wanted.has(space._id)) continue
        const types = isListed ? space.types.filter((it) => it !== type._id) : [...space.types, type._id]
        txes.push(factory.createTxUpdateDoc(card.class.CardSpace, space.space, space._id, { types }))
      }
    }
    return txes
  },
  typeKeys: (op) => [op.type]
}
