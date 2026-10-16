import contact from '@hcengineering/contact'
import core, {
  type AnyAttribute,
  type Class,
  type CustomSequence,
  type Data,
  DateRangeMode,
  type Doc,
  type Enum,
  IndexKind,
  type Obj,
  type PropertyType,
  type Ref,
  type TxCUD,
  type Type
} from '@hcengineering/core'
import {
  ArrOf,
  TypeBoolean,
  TypeDate,
  TypeEnum,
  TypeIdentifier,
  TypeMarkup,
  TypeNumber,
  TypeRef,
  TypeString
} from '@hcengineering/model'
import { toLabel } from '../keys'
import type { FieldKind } from '../operations'
import type { StepContext } from '../registry'
import { keyFields, withServone } from '../servone-fields'

export interface FieldBuild {
  owner: Ref<Class<Obj>>
  ownerName: string
  key: string
  name: string
  kind: FieldKind
  isRequired: boolean
  attributeId: Ref<AnyAttribute>
  attributeName: string
  enumId: Ref<Enum>
  needsEnum: boolean
  sequenceId: Ref<CustomSequence>
  needsSequence: boolean
  packKey?: string
}

interface HulyType {
  type: Type<PropertyType>
  index?: IndexKind
}

// Same builders and index choices as the type editors in plugins/setting-resources/src/components/typeEditors.
function hulyType (field: FieldBuild): HulyType {
  const kind = field.kind
  switch (kind.kind) {
    case 'text':
      return { type: TypeString(), index: IndexKind.FullText }
    case 'longText':
      return { type: TypeMarkup() }
    case 'number':
      return { type: TypeNumber(kind.min, kind.max, kind.isInteger === true ? 0 : undefined) }
    case 'money':
      return { type: TypeNumber() }
    case 'date':
      return { type: TypeDate(kind.hasTime === true ? DateRangeMode.DATETIME : DateRangeMode.DATE) }
    case 'boolean':
      return { type: TypeBoolean() }
    case 'person':
      return { type: TypeRef(contact.mixin.Employee) }
    case 'select':
      return { type: TypeEnum(field.enumId), index: IndexKind.FullText }
    case 'multiSelect':
      return { type: ArrOf(TypeEnum(field.enumId)), index: IndexKind.FullText }
    case 'autoNumber':
      return { type: TypeIdentifier(field.sequenceId), index: IndexKind.FullText }
  }
}

export function buildField (ctx: StepContext, field: FieldBuild): Array<TxCUD<Doc>> {
  const txes: Array<TxCUD<Doc>> = []
  const kind = field.kind
  if ((kind.kind === 'select' || kind.kind === 'multiSelect') && field.needsEnum) {
    const options: Data<Enum> = { name: `${field.ownerName} · ${field.name}`, enumValues: kind.options.map((it) => it.trim()) }
    txes.push(
      ctx.factory.createTxCreateDoc(
        core.class.Enum,
        core.space.Model,
        withServone(options, { servoneOwnerField: field.attributeId }),
        field.enumId
      )
    )
  }
  if (kind.kind === 'autoNumber' && field.needsSequence) {
    const sequence: Data<CustomSequence> = { prefix: kind.prefix.toUpperCase(), sequence: 0, attachedTo: core.class.CustomSequence }
    txes.push(ctx.factory.createTxCreateDoc(core.class.CustomSequence, core.space.Workspace, sequence, field.sequenceId))
  }
  const { type, index } = hulyType(field)
  const extra = keyFields(field.key, field.packKey)
  if (kind.kind === 'money') extra.servoneFormat = { kind: 'money', currency: kind.currency.toUpperCase() }
  const attribute: Data<AnyAttribute> = {
    attributeOf: field.owner,
    name: field.attributeName,
    label: toLabel(field.name),
    isCustom: true,
    type,
    required: field.isRequired
  }
  if (index !== undefined) attribute.index = index
  txes.push(ctx.factory.createTxCreateDoc(core.class.Attribute, core.space.Model, withServone(attribute, extra), field.attributeId))
  return txes
}
