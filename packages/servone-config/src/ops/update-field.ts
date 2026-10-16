import core, { type AnyAttribute, type DocumentUpdate } from '@hcengineering/core'
import { labelText, sameName, toLabel } from '../keys'
import type { OperationModule } from '../registry'
import type { DiffLine } from '../types'
import { fieldIssues, issue, line, mustField, mustOwner, nameIssues, quote } from './common'

export const updateField: OperationModule<'updateField'> = {
  parse: (input) => ({
    op: 'updateField',
    type: input.string('type'),
    field: input.string('field'),
    name: input.optionalString('name'),
    required: input.optionalBoolean('required')
  }),
  validate: (op, { state }) => {
    const issues = fieldIssues(state, op.type, op.field)
    if (issues.length > 0) return issues
    if (op.name === undefined && op.required === undefined) return [issue('invalid-input', 'Không có gì để đổi')]
    const owner = mustOwner(state, op.type)
    const attr = mustField(state, owner, op.field)
    if (op.name !== undefined) {
      const name = op.name
      issues.push(...nameIssues(name, 'trường'))
      const clash = state.fieldsWithInherited(owner._id).find((it) => it._id !== attr._id && sameName(labelText(it.label), name))
      if (clash !== undefined) issues.push(issue('duplicate-name', `Đã có trường tên ${quote(name.trim())} trong ${quote(state.nameOf(owner))}`))
    }
    if (op.required !== undefined && attr.isCustom !== true) {
      issues.push(issue('system-protected', `Không đổi được tính bắt buộc của trường có sẵn ${quote(labelText(attr.label))}`))
    }
    return issues
  },
  inverse: (op, { state }) => {
    const attr = mustField(state, mustOwner(state, op.type), op.field)
    return [
      {
        op: 'updateField',
        type: op.type,
        field: op.field,
        name: op.name !== undefined ? labelText(attr.label) : undefined,
        required: op.required !== undefined ? attr.required === true : undefined
      }
    ]
  },
  diff: (op, { state }) => {
    const owner = mustOwner(state, op.type)
    const current = quote(labelText(mustField(state, owner, op.field).label))
    const ownerName = quote(state.nameOf(owner))
    const lines: DiffLine[] = []
    if (op.name !== undefined) lines.push(line(`Đổi tên trường ${current} thành ${quote(op.name.trim())} trong ${ownerName}`))
    if (op.required !== undefined) {
      lines.push(line(`Trường ${current} trong ${ownerName} ${op.required ? 'thành bắt buộc' : 'không còn bắt buộc'}`))
    }
    return lines
  },
  risk: () => 'safe',
  expand: (op, { state, factory }) => {
    const attr = mustField(state, mustOwner(state, op.type), op.field)
    const update: DocumentUpdate<AnyAttribute> = {}
    if (op.name !== undefined) update.label = toLabel(op.name)
    if (op.required !== undefined) update.required = op.required
    return [factory.createTxUpdateDoc(core.class.Attribute, core.space.Model, attr._id, update)]
  },
  typeKeys: (op) => [op.type]
}
