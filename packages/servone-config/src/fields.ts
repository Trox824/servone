import card, { type Card, type MasterTag, type Tag } from '@hcengineering/card'
import contact from '@hcengineering/contact'
import core, {
  type AnyAttribute,
  type ArrOf,
  type CustomSequence,
  DateRangeMode,
  type Doc,
  type DocumentQuery,
  type Enum,
  type EnumOf,
  type PropertyType,
  type Ref,
  type RefTo,
  type Type,
  type TypeDate,
  type TypeIdentifier,
  type TypeNumber
} from '@hcengineering/core'
import type { ConfigClient } from './client'
import type { FieldKind } from './operations'
import { readServone } from './servone-fields'
import type { ModelState } from './state'
import type { FieldKindInfo } from './types'

export const KIND_LABEL: Record<FieldKind['kind'], string> = {
  text: 'Văn bản',
  longText: 'Văn bản dài',
  number: 'Số',
  money: 'Tiền',
  date: 'Ngày',
  boolean: 'Có / Không',
  select: 'Danh sách chọn',
  multiSelect: 'Chọn nhiều',
  person: 'Người',
  autoNumber: 'Mã tự tăng'
}

const isEnumOf = (type: Type<PropertyType>): type is EnumOf => type._class === core.class.EnumOf
const isArrOf = (type: Type<PropertyType>): type is ArrOf<PropertyType> => type._class === core.class.ArrOf
const isTypeNumber = (type: Type<PropertyType>): type is TypeNumber => type._class === core.class.TypeNumber
const isTypeDate = (type: Type<PropertyType>): type is TypeDate => type._class === core.class.TypeDate
const isRefTo = (type: Type<PropertyType>): type is RefTo<Doc> => type._class === core.class.RefTo
const isIdentifier = (type: Type<PropertyType>): type is TypeIdentifier => type._class === core.class.TypeIdentifier

export function enumRefOf (attr: AnyAttribute): Ref<Enum> | undefined {
  if (isEnumOf(attr.type)) return attr.type.of
  if (isArrOf(attr.type) && isEnumOf(attr.type.of)) return attr.type.of.of
  return undefined
}

export function identifierOf (attr: AnyAttribute): Ref<CustomSequence> | undefined {
  return isIdentifier(attr.type) ? attr.type.of : undefined
}

export function fieldKindOf (attr: AnyAttribute, state: ModelState): FieldKindInfo {
  const type = attr.type
  if (type._class === core.class.TypeString) return { kind: 'text' }
  if (type._class === core.class.TypeMarkup) return { kind: 'longText' }
  if (type._class === core.class.TypeBoolean) return { kind: 'boolean' }
  if (isTypeNumber(type)) {
    const format = readServone(attr).servoneFormat
    if (format !== undefined) return { kind: 'money', currency: format.currency }
    return { kind: 'number', min: type.min, max: type.max, isInteger: type.digits === 0 }
  }
  if (isTypeDate(type)) return { kind: 'date', hasTime: type.mode === DateRangeMode.DATETIME }
  const enumId = enumRefOf(attr)
  if (enumId !== undefined) {
    const options = state.enumById(enumId)?.enumValues ?? []
    return isArrOf(type) ? { kind: 'multiSelect', options } : { kind: 'select', options }
  }
  if (isRefTo(type)) {
    return type.to === contact.mixin.Employee ? { kind: 'person' } : { kind: 'reference', to: state.ownerKey(type.to) }
  }
  if (isIdentifier(type)) return { kind: 'autoNumber', prefix: state.sequence(type.of)?.prefix ?? '' }
  return { kind: 'other', type: type._class }
}

export function isFieldKind (kind: FieldKindInfo): kind is FieldKind {
  return kind.kind !== 'reference' && kind.kind !== 'other'
}

export function kindText (kind: FieldKind): string {
  switch (kind.kind) {
    case 'select':
    case 'multiSelect':
      return `${KIND_LABEL[kind.kind]}: ${kind.options.map((it) => it.trim()).join(', ')}`
    case 'money':
      return `${KIND_LABEL.money} ${kind.currency}`
    case 'autoNumber':
      return `${KIND_LABEL.autoNumber} ${kind.prefix.toUpperCase()}`
    default:
      return KIND_LABEL[kind.kind]
  }
}

export interface FieldScope {
  types: Array<Ref<MasterTag>>
  path: string
  group?: Ref<Tag>
}

export function fieldScope (state: ModelState, attr: AnyAttribute): FieldScope {
  const group = state.groups().find((it) => it._id === attr.attributeOf)
  if (group !== undefined) {
    const base = state.types().find((it) => it._id === group.extends)
    // Mixin values live under the mixin id on the card.
    return { types: base !== undefined ? state.descendantsOf(base._id) : [], path: `${group._id}.${attr.name}`, group: group._id }
  }
  const type = state.types().find((it) => it._id === attr.attributeOf)
  return { types: type !== undefined ? state.descendantsOf(type._id) : [], path: attr.name }
}

export async function countRecords (
  client: ConfigClient,
  types: Array<Ref<MasterTag>>,
  query: DocumentQuery<Card>
): Promise<number> {
  if (types.length === 0) return 0
  const found = await client.findAll(card.class.Card, { ...query, _class: { $in: types } }, { limit: 1, total: true })
  return found.total
}
