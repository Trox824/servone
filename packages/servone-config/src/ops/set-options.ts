import card, { type Card } from '@hcengineering/card'
import core, {
  type AnyAttribute,
  type Doc,
  type DocumentUpdate,
  type Enum,
  type MixinUpdate,
  type Ref,
  type TxCUD
} from '@hcengineering/core'
import { ruleNames, ruleUsesOf } from '../automation-validate'
import type { ConfigClient } from '../client'
import { countRecords, enumRefOf, type FieldScope, fieldScope } from '../fields'
import type { JsonReader } from '../json'
import { labelText } from '../keys'
import type { Operation, OptionChange, SetOptionsOp } from '../operations'
import type { OperationModule } from '../registry'
import { readServone } from '../servone-fields'
import type { ModelState } from '../state'
import type { DiffLine, Issue } from '../types'
import { countedLine, fieldIssues, issue, line, mustField, mustOwner, quote } from './common'

// One transaction per record, counted across the whole plan; bigger remaps belong in a server migration.
const MAX_REMAP_RECORDS = 1000

type Mapping = Map<string, string | undefined>

export interface OptionOutcome {
  options: string[]
  mapping: Mapping
  issues: Issue[]
}

interface OptionField {
  attr: AnyAttribute
  owned: Enum
  isMulti: boolean
  scope: FieldScope
}

type FieldValue = string | string[]

function parseOptionChange (input: JsonReader): OptionChange {
  if (input.has('add')) return { add: input.string('add'), at: input.optionalNumber('at') }
  if (input.has('rename')) return { rename: input.string('rename'), to: input.string('to') }
  if (input.has('reorder')) return { reorder: input.stringArray('reorder') }
  return { remove: input.string('remove'), mapTo: input.optionalString('mapTo') }
}

function missingOption (option: string): Issue {
  return issue('bad-option', `Không có lựa chọn ${quote(option)}`)
}

export function simulateOptions (initial: string[], changes: OptionChange[]): OptionOutcome {
  let options = [...initial]
  const mapping: Mapping = new Map(initial.map((it) => [it, it]))
  const issues: Issue[] = []
  const remap = (from: string, to: string | undefined): void => {
    for (const [original, current] of mapping) if (current === from) mapping.set(original, to)
  }
  for (const change of changes) {
    if ('add' in change) {
      const added = change.add.trim()
      if (added.length === 0) {
        issues.push(issue('bad-option', 'Lựa chọn không được để trống'))
      } else if (options.includes(added)) {
        issues.push(issue('bad-option', `Lựa chọn ${quote(added)} đã có`))
      } else {
        options.splice(change.at ?? options.length, 0, added)
      }
    } else if ('rename' in change) {
      const to = change.to.trim()
      if (!options.includes(change.rename)) {
        issues.push(missingOption(change.rename))
      } else if (to.length === 0 || options.includes(to)) {
        issues.push(issue('bad-option', `Không đổi được ${quote(change.rename)} thành ${quote(to)}`))
      } else {
        options = options.map((it) => (it === change.rename ? to : it))
        remap(change.rename, to)
      }
    } else if ('reorder' in change) {
      const isPermutation = change.reorder.length === options.length && change.reorder.every((it) => options.includes(it))
      if (isPermutation) options = [...change.reorder]
      else issues.push(issue('bad-option', 'Thứ tự mới phải gồm đúng các lựa chọn hiện có'))
    } else if (!options.includes(change.remove)) {
      issues.push(missingOption(change.remove))
    } else if (change.mapTo !== undefined && (change.mapTo === change.remove || !options.includes(change.mapTo))) {
      issues.push(issue('bad-option', `Giá trị thay thế ${quote(change.mapTo)} không có trong danh sách`))
    } else {
      options = options.filter((it) => it !== change.remove)
      remap(change.remove, change.mapTo)
    }
  }
  return { options, mapping, issues }
}

function remapsOf (mapping: Mapping): Array<[string, string | undefined]> {
  return [...mapping].filter(([original, current]) => original !== current)
}

function findOptionField (state: ModelState, op: SetOptionsOp): OptionField | undefined {
  const attr = mustField(state, mustOwner(state, op.type), op.field)
  const enumId = enumRefOf(attr)
  const owned = enumId !== undefined ? state.enumById(enumId) : undefined
  if (owned === undefined) return undefined
  return { attr, owned, isMulti: attr.type._class === core.class.ArrOf, scope: fieldScope(state, attr) }
}

function mustOptionField (state: ModelState, op: SetOptionsOp): OptionField {
  const found = findOptionField(state, op)
  if (found === undefined) throw new Error(`Field "${op.field}" is not a dropdown after validation`)
  return found
}

async function affectedRecords (client: ConfigClient, field: OptionField, originals: string[]): Promise<Card[]> {
  if (originals.length === 0 || field.scope.types.length === 0) return []
  // An array field matches a scalar query by containment; $in against an array column is not portable.
  const queries = field.isMulti
    ? originals.map((original) => ({ [field.scope.path]: original }))
    : [{ [field.scope.path]: { $in: originals } }]
  const byId = new Map<Ref<Card>, Card>()
  for (const query of queries) {
    for (const record of await client.findAll(card.class.Card, { ...query, _class: { $in: field.scope.types } })) {
      byId.set(record._id, record)
    }
  }
  return [...byId.values()]
}

function currentValue (record: Card, field: OptionField): FieldValue | undefined {
  const holder: unknown = field.scope.group !== undefined ? Reflect.get(record, field.scope.group) : record
  if (typeof holder !== 'object' || holder === null) return undefined
  const raw: unknown = Reflect.get(holder, field.attr.name)
  if (typeof raw === 'string') return raw
  return Array.isArray(raw) ? raw.filter((it): it is string => typeof it === 'string') : undefined
}

function mapOne (option: string, mapping: Mapping): string | undefined {
  return mapping.has(option) ? mapping.get(option) : option
}

function remapValue (current: FieldValue, mapping: Mapping): FieldValue | undefined {
  if (typeof current === 'string') return mapOne(current, mapping)
  const next: string[] = []
  for (const option of current) {
    const mapped = mapOne(option, mapping)
    if (mapped !== undefined && !next.includes(mapped)) next.push(mapped)
  }
  return next
}

function docField (name: string, next: FieldValue): DocumentUpdate<Card> {
  const update: DocumentUpdate<Card> = {}
  return Object.assign(update, { [name]: next })
}

function mixinField (name: string, next: FieldValue): MixinUpdate<Card, Card> {
  const update: MixinUpdate<Card, Card> = {}
  return Object.assign(update, { [name]: next })
}

function inverseChanges (initial: string[], outcome: OptionOutcome): OptionChange[] {
  const changes: OptionChange[] = []
  let options = [...outcome.options]
  for (const [original, current] of outcome.mapping) {
    if (current !== undefined && current !== original && options.includes(current) && !options.includes(original)) {
      changes.push({ rename: current, to: original })
      options = options.map((it) => (it === current ? original : it))
    }
  }
  for (const option of [...options]) {
    if (!initial.includes(option)) {
      changes.push({ remove: option })
      options = options.filter((it) => it !== option)
    }
  }
  for (const option of initial) {
    if (!options.includes(option)) {
      changes.push({ add: option })
      options.push(option)
    }
  }
  changes.push({ reorder: [...initial] })
  return changes
}

function changeText (change: OptionChange, field: string): string {
  if ('add' in change) return `Thêm lựa chọn ${quote(change.add.trim())} vào trường ${field}`
  if ('rename' in change) return `Đổi lựa chọn ${quote(change.rename)} thành ${quote(change.to.trim())} trong trường ${field}`
  if ('reorder' in change) return `Sắp xếp lại lựa chọn của trường ${field}`
  return change.mapTo !== undefined
    ? `Xóa lựa chọn ${quote(change.remove)} khỏi trường ${field}, chuyển hồ sơ sang ${quote(change.mapTo)}`
    : `Xóa lựa chọn ${quote(change.remove)} khỏi trường ${field}`
}

const hasRemoval = (op: SetOptionsOp): boolean => op.options.some((it) => 'remove' in it)
const hasMappedRemoval = (op: SetOptionsOp): boolean => op.options.some((it) => 'remove' in it && it.mapTo !== undefined)

export const setOptions: OperationModule<'setOptions'> = {
  parse: (input) => ({
    op: 'setOptions',
    type: input.string('type'),
    field: input.string('field'),
    options: input.objects('options').map(parseOptionChange)
  }),
  validate: async (op, { state, client }) => {
    const issues = fieldIssues(state, op.type, op.field)
    if (issues.length > 0) return issues
    const attr = mustField(state, mustOwner(state, op.type), op.field)
    const field = findOptionField(state, op)
    if (field === undefined) return [issue('not-allowed', `Trường ${quote(labelText(attr.label))} không phải danh sách chọn`)]
    if (readServone(field.owned).servoneOwnerField !== attr._id) {
      return [
        issue('unsupported', `Danh sách chọn của trường ${quote(labelText(attr.label))} dùng chung với trường khác; hãy sửa trong cài đặt cũ`)
      ]
    }
    if (state.wasTouched(field.owned._id)) return [issue('not-allowed', 'Gộp các thay đổi lựa chọn của một trường vào một thao tác')]
    if (op.options.length === 0) return [issue('invalid-input', 'Không có thay đổi lựa chọn nào')]
    const outcome = simulateOptions(field.owned.enumValues, op.options)
    if (outcome.issues.length > 0) return outcome.issues
    const uses = ruleUsesOf(state, attr)
    for (const change of op.options) {
      if (!('remove' in change)) continue
      const using = uses.filter((it) => it.fieldValue === change.remove)
      if (using.length > 0) issues.push(issue('bad-option', `Lựa chọn ${quote(change.remove)} đang được dùng trong quy tắc ${ruleNames(using)}`))
    }
    let total = state.recordWrites()
    for (const [original, current] of remapsOf(outcome.mapping)) {
      const used = await countRecords(client, field.scope.types, { [field.scope.path]: original })
      total += used
      if (current === undefined && used > 0) {
        issues.push(issue('bad-option', `Lựa chọn ${quote(original)} đang được dùng ở ${used} hồ sơ; hãy chọn giá trị thay thế (mapTo)`))
      }
    }
    if (total > MAX_REMAP_RECORDS) {
      issues.push(issue('not-allowed', `Thay đổi này cần cập nhật ${total} hồ sơ, vượt giới hạn ${MAX_REMAP_RECORDS} mỗi lần`))
    }
    return issues
  },
  measure: async (op, { state, client }) => {
    const field = mustOptionField(state, op)
    const outcome = simulateOptions(field.owned.enumValues, op.options)
    const originals = remapsOf(outcome.mapping).map(([original]) => original)
    return (await affectedRecords(client, field, originals)).length
  },
  inverse: (op, { state }): Operation[] => {
    const field = mustOptionField(state, op)
    const outcome = simulateOptions(field.owned.enumValues, op.options)
    return [{ op: 'setOptions', type: op.type, field: op.field, options: inverseChanges(field.owned.enumValues, outcome) }]
  },
  diff: (op, { state }, affected) => {
    const name = quote(labelText(mustOptionField(state, op).attr.label))
    const lines: DiffLine[] = op.options.map((change) => line(changeText(change, name)))
    if (affected > 0) {
      const risk = hasRemoval(op) ? 'destructive' : 'safe'
      lines.push(countedLine(`Cập nhật ${affected} hồ sơ theo lựa chọn mới của trường ${name}`, risk, affected))
      if (hasMappedRemoval(op)) lines.push(line('Hoàn tác sẽ không trả lại giá trị cũ của các hồ sơ đã chuyển', 'destructive'))
    }
    return lines
  },
  risk: (op, ctx, affected) => (affected > 0 && hasRemoval(op) ? 'destructive' : 'safe'),
  expand: async (op, { state, client, factory }) => {
    const field = mustOptionField(state, op)
    const outcome = simulateOptions(field.owned.enumValues, op.options)
    const txes: Array<TxCUD<Doc>> = [
      factory.createTxUpdateDoc(core.class.Enum, core.space.Model, field.owned._id, { enumValues: outcome.options })
    ]
    const originals = remapsOf(outcome.mapping).map(([original]) => original)
    for (const record of await affectedRecords(client, field, originals)) {
      const current = currentValue(record, field)
      if (current === undefined) continue
      const next = remapValue(current, outcome.mapping)
      if (next === undefined || JSON.stringify(next) === JSON.stringify(current)) continue
      if (field.scope.group !== undefined) {
        txes.push(factory.createTxMixin<Card, Card>(record._id, record._class, record.space, field.scope.group, mixinField(field.attr.name, next)))
      } else {
        txes.push(factory.createTxUpdateDoc<Card>(record._class, record.space, record._id, docField(field.attr.name, next)))
      }
    }
    return txes
  },
  typeKeys: (op) => [op.type]
}
