import card, { type MasterTag } from '@hcengineering/card'
import core, {
  type AnyAttribute,
  type Association,
  type Class,
  ClassifierKind,
  type Data,
  type Doc,
  generateId,
  type Ref,
  type TxCUD
} from '@hcengineering/core'
import { fieldKindOf, isFieldKind, KIND_LABEL } from '../fields'
import { labelText, toLabel } from '../keys'
import type { CopyTypeOp, FieldKind, Operation } from '../operations'
import type { OperationModule } from '../registry'
import { withServone } from '../servone-fields'
import type { ModelState } from '../state'
import type { DiffLine } from '../types'
import { activeTypeIssues, colorFor, issue, line, mustType, newKeyIssues, quote, typeNameIssues } from './common'
import { buildField } from './field-build'
import { associationTx, specOf } from './links'

interface CopiedField {
  attr: AnyAttribute
  kind: FieldKind
}

interface CopySource {
  type: MasterTag
  fields: CopiedField[]
  skipped: AnyAttribute[]
  links: Association[]
}

function sourceOf (state: ModelState, op: CopyTypeOp): CopySource {
  const type = mustType(state, op.from)
  const fields: CopiedField[] = []
  const skipped: AnyAttribute[] = []
  for (const attr of state.fieldsOf(type._id)) {
    if (attr.hidden === true || attr.isCustom !== true) continue
    const kind = fieldKindOf(attr, state)
    // Sequence prefixes are unique per workspace, so an auto number cannot be cloned as is.
    if (isFieldKind(kind) && kind.kind !== 'autoNumber') fields.push({ attr, kind })
    else skipped.push(attr)
  }
  const cardTypes = new Set<string>(state.types().map((it) => it._id))
  const links = state
    .links()
    .filter((it) => it.classA === type._id || it.classB === type._id)
    .filter((it) => cardTypes.has(it.classA) && cardTypes.has(it.classB))
  return { type, fields, skipped, links }
}

function copiedLinkKey (state: ModelState, op: CopyTypeOp, link: Association): string {
  return `${op.key}.${state.keyOf(link)}`
}

function endOf (state: ModelState, ref: Ref<Class<Doc>>, source: MasterTag, copy: Ref<MasterTag>): Ref<MasterTag> {
  if (ref === source._id) return copy
  const type = state.types().find((it) => it._id === ref)
  if (type === undefined) throw new Error(`Link end ${ref} is not a record type`)
  return type._id
}

function skipReason (state: ModelState, attr: AnyAttribute): string {
  return fieldKindOf(attr, state).kind === 'autoNumber' ? KIND_LABEL.autoNumber : 'kiểu trường không hỗ trợ'
}

export const copyType: OperationModule<'copyType'> = {
  parse: (input) => ({ op: 'copyType', from: input.string('from'), key: input.string('key'), name: input.string('name') }),
  validate: (op, { state }) => {
    const issues = activeTypeIssues(state, op.from)
    if (issues.length > 0) return issues
    issues.push(...newKeyIssues(state, op.key), ...typeNameIssues(state, op.name))
    for (const link of sourceOf(state, op).links) {
      const key = copiedLinkKey(state, op, link)
      if (state.resolveLink(key) !== undefined) issues.push(issue('duplicate-key', `Khóa liên kết "${key}" đã được dùng`))
    }
    return issues
  },
  inverse: (op, { state }): Operation[] => [
    ...sourceOf(state, op).links.map((link): Operation => ({ op: 'removeLink', link: copiedLinkKey(state, op, link) })),
    { op: 'archiveType', type: op.key }
  ],
  diff: (op, { state }) => {
    const source = sourceOf(state, op)
    const lines: DiffLine[] = [
      line(
        `Sao chép ${quote(state.nameOf(source.type))} thành ${quote(op.name.trim())}: ${source.fields.length} trường, ${source.links.length} liên kết`
      )
    ]
    for (const attr of source.skipped) {
      lines.push(line(`Không sao chép trường ${quote(labelText(attr.label))} (${skipReason(state, attr)}); hãy thêm lại nếu cần`))
    }
    lines.push(line('Hiển thị, quyền và tự động hóa không được sao chép'))
    return lines
  },
  risk: () => 'safe',
  expand: (op, ctx) => {
    const { state, factory } = ctx
    const source = sourceOf(state, op)
    const id = generateId<MasterTag>()
    const name = op.name.trim()
    const base: Data<MasterTag> = {
      extends: source.type.extends ?? card.class.Card,
      label: toLabel(name),
      kind: ClassifierKind.CLASS,
      icon: source.type.icon ?? card.icon.MasterTag,
      background: colorFor(name)
    }
    const txes: Array<TxCUD<Doc>> = [
      factory.createTxCreateDoc(card.class.MasterTag, core.space.Model, withServone(base, { servoneKey: op.key }), id)
    ]
    for (const { attr, kind } of source.fields) {
      txes.push(
        ...buildField(ctx, {
          owner: id,
          ownerName: name,
          key: state.fieldKey(attr),
          name: labelText(attr.label),
          kind,
          isRequired: attr.required === true,
          attributeId: generateId(),
          // Same column names as the source keep exports of the two types comparable.
          attributeName: attr.name,
          enumId: generateId(),
          needsEnum: true,
          sequenceId: generateId(),
          needsSequence: false
        })
      )
    }
    for (const link of source.links) {
      const ends = { from: endOf(state, link.classA, source.type, id), to: endOf(state, link.classB, source.type, id) }
      txes.push(associationTx(factory, copiedLinkKey(state, op, link), specOf(state, link), ends, generateId()))
    }
    for (const space of state.spacesOf(source.type._id)) {
      txes.push(factory.createTxUpdateDoc(card.class.CardSpace, space.space, space._id, { types: [...space.types, id] }))
    }
    return txes
  },
  typeKeys: (op) => [op.from, op.key]
}
