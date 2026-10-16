import type { MasterTag, Tag } from '@hcengineering/card'
import { type CustomSequence, type Enum, generateId } from '@hcengineering/core'
import { kindText } from '../fields'
import type { JsonReader } from '../json'
import { isValidKey, labelText, sameName, toRef } from '../keys'
import type { FieldKind } from '../operations'
import type { OperationModule } from '../registry'
import type { ModelState } from '../state'
import type { Issue } from '../types'
import { isPackInstalled, issue, line, mustOwner, nameIssues, ownerIssues, quote } from './common'
import { buildField } from './field-build'

// ISO 4217 codes.
const CURRENCY_PATTERN = /^[A-Z]{3}$/
// Keeps generated record ids like "NP-12" short in lists.
const PREFIX_PATTERN = /^[A-Z0-9]{1,10}$/

export function parseFieldKind (input: JsonReader): FieldKind {
  const kind = input.string('kind')
  switch (kind) {
    case 'text':
    case 'longText':
    case 'boolean':
    case 'person':
      return { kind }
    case 'number':
      return { kind, min: input.optionalNumber('min'), max: input.optionalNumber('max'), isInteger: input.optionalBoolean('isInteger') }
    case 'money':
      return { kind, currency: input.string('currency').toUpperCase() }
    case 'date':
      return { kind, hasTime: input.optionalBoolean('hasTime') }
    case 'select':
    case 'multiSelect':
      return { kind, options: input.stringArray('options') }
    case 'autoNumber':
      return { kind, prefix: input.string('prefix') }
    default:
      input.problem('kind', 'một loại trường: text, longText, number, money, date, boolean, select, multiSelect, person, autoNumber')
      return { kind: 'text' }
  }
}

export function newFieldIssues (state: ModelState, owner: MasterTag | Tag, key: string, name: string): Issue[] {
  const issues = nameIssues(name, 'trường')
  const fields = state.fieldsWithInherited(owner._id)
  if (!isValidKey(key)) issues.push(issue('invalid-input', `Khóa trường "${key}" không hợp lệ`))
  if (fields.some((it) => state.fieldKey(it) === key)) {
    issues.push(issue('duplicate-key', `Khóa trường "${key}" đã có trong ${quote(state.nameOf(owner))}`))
  }
  if (fields.some((it) => sameName(labelText(it.label), name))) {
    issues.push(issue('duplicate-name', `Đã có trường tên ${quote(name.trim())} trong ${quote(state.nameOf(owner))}`))
  }
  return issues
}

function kindIssues (state: ModelState, kind: FieldKind): Issue[] {
  switch (kind.kind) {
    case 'select':
    case 'multiSelect': {
      const options = kind.options.map((it) => it.trim())
      if (options.length === 0) return [issue('bad-option', 'Danh sách chọn cần ít nhất một lựa chọn')]
      if (options.some((it) => it.length === 0)) return [issue('bad-option', 'Lựa chọn không được để trống')]
      if (new Set(options.map((it) => it.toLocaleLowerCase('vi'))).size !== options.length) {
        return [issue('bad-option', 'Các lựa chọn bị trùng nhau')]
      }
      return []
    }
    case 'number':
      return kind.min !== undefined && kind.max !== undefined && kind.min > kind.max
        ? [issue('invalid-input', 'Giá trị nhỏ nhất lớn hơn giá trị lớn nhất')]
        : []
    case 'money':
      return CURRENCY_PATTERN.test(kind.currency.toUpperCase()) ? [] : [issue('invalid-input', `Mã tiền tệ "${kind.currency}" không hợp lệ (ví dụ VND)`)]
    case 'autoNumber': {
      const prefix = kind.prefix.toUpperCase()
      if (!PREFIX_PATTERN.test(prefix)) return [issue('invalid-input', `Tiền tố "${kind.prefix}" chỉ gồm 1-10 chữ hoặc số`)]
      if (state.sequences().some((it) => it.prefix.toUpperCase() === prefix)) {
        return [issue('duplicate-key', `Tiền tố "${prefix}" đã được dùng`)]
      }
      return []
    }
    default:
      return []
  }
}

export const addField: OperationModule<'addField'> = {
  parse: (input) => ({
    op: 'addField',
    type: input.string('type'),
    key: input.string('key'),
    name: input.string('name'),
    kind: parseFieldKind(input.object('kind')),
    required: input.optionalBoolean('required'),
    packKey: input.optionalString('packKey')
  }),
  isInstalled: (op, { state }) => {
    const owner = state.resolveOwner(op.type)
    return owner !== undefined && isPackInstalled(state.resolveField(owner, op.key), op.packKey)
  },
  validate: (op, { state }) => {
    const issues = ownerIssues(state, op.type)
    if (issues.length > 0) return issues
    return [...newFieldIssues(state, mustOwner(state, op.type), op.key, op.name), ...kindIssues(state, op.kind)]
  },
  inverse: (op) => [{ op: 'removeField', type: op.type, field: op.key }],
  diff: (op, { state }) => [
    line(`Thêm trường ${quote(op.name.trim())} (${kindText(op.kind)}) vào ${quote(state.nameOf(mustOwner(state, op.type)))}`)
  ],
  risk: () => 'safe',
  expand: (op, ctx) => {
    const owner = mustOwner(ctx.state, op.type)
    return buildField(ctx, {
      owner: owner._id,
      ownerName: ctx.state.nameOf(owner),
      key: op.key,
      name: op.name.trim(),
      kind: op.kind,
      isRequired: op.required === true,
      attributeId: generateId(),
      // Same naming as CreateAttribute.svelte in setting-resources.
      attributeName: `custom${generateId()}`,
      enumId: generateId(),
      needsEnum: true,
      sequenceId: generateId(),
      needsSequence: true,
      packKey: op.packKey
    })
  },
  typeKeys: (op) => [op.type]
}

export const restoreField: OperationModule<'restoreField'> = {
  parse: (input) => ({
    op: 'restoreField',
    type: input.string('type'),
    key: input.string('key'),
    name: input.string('name'),
    kind: parseFieldKind(input.object('kind')),
    required: input.optionalBoolean('required'),
    attributeId: input.string('attributeId'),
    attributeName: input.string('attributeName'),
    enumId: input.optionalString('enumId'),
    sequenceId: input.optionalString('sequenceId'),
    packKey: input.optionalString('packKey')
  }),
  validate: (op, { state }) => {
    const issues = ownerIssues(state, op.type)
    if (issues.length > 0) return issues
    if (state.get(toRef(op.attributeId)) !== undefined) return [issue('not-allowed', `Trường ${quote(op.name)} đã tồn tại`)]
    return newFieldIssues(state, mustOwner(state, op.type), op.key, op.name)
  },
  inverse: (op) => [{ op: 'removeField', type: op.type, field: op.key }],
  diff: (op, { state }) => [line(`Khôi phục trường ${quote(op.name.trim())} trong ${quote(state.nameOf(mustOwner(state, op.type)))}`)],
  risk: () => 'safe',
  expand: (op, ctx) => {
    const owner = mustOwner(ctx.state, op.type)
    const enumId = op.enumId !== undefined ? toRef<Enum>(op.enumId) : generateId<Enum>()
    const sequenceId = op.sequenceId !== undefined ? toRef<CustomSequence>(op.sequenceId) : generateId<CustomSequence>()
    // Same attribute name: removing an Attribute leaves record values in place, so they come back.
    return buildField(ctx, {
      owner: owner._id,
      ownerName: ctx.state.nameOf(owner),
      key: op.key,
      name: op.name.trim(),
      kind: op.kind,
      isRequired: op.required === true,
      attributeId: toRef(op.attributeId),
      attributeName: op.attributeName,
      enumId,
      needsEnum: ctx.state.enumById(enumId) === undefined,
      sequenceId,
      needsSequence: ctx.state.sequence(sequenceId) === undefined,
      packKey: op.packKey
    })
  },
  typeKeys: (op) => [op.type]
}
