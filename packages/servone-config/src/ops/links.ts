import type { MasterTag } from '@hcengineering/card'
import core, { type Association, type Data, type Doc, generateId, type Ref, type TxCUD, type TxFactory } from '@hcengineering/core'
import { isValidKey, toRef } from '../keys'
import type { AddLinkOp } from '../operations'
import type { OperationModule } from '../registry'
import { keyFields, readServone, withServone } from '../servone-fields'
import type { ModelState } from '../state'
import type { Issue } from '../types'
import { activeTypeIssues, countedLine, isPackInstalled, issue, line, mustType, nameIssues, quote } from './common'

export type LinkSpec = Omit<AddLinkOp, 'op' | 'key'>

export interface LinkEnds {
  from: Ref<MasterTag>
  to: Ref<MasterTag>
}

export function defaultLinkKey (from: string, to: string): string {
  return `${from}-${to}`
}

function sideIssues (state: ModelState, key: string): Issue[] {
  const group = state.resolveType(key) === undefined ? state.resolveGroup(key) : undefined
  if (group !== undefined) {
    return [issue('unsupported', `Liên kết chỉ nối hai biểu mẫu; ${quote(state.nameOf(group))} là nhóm trường`)]
  }
  return activeTypeIssues(state, key)
}

function linkIssues (state: ModelState, key: string, spec: LinkSpec): Issue[] {
  const issues = [
    ...sideIssues(state, spec.from),
    ...sideIssues(state, spec.to),
    ...nameIssues(spec.fromName, 'liên kết'),
    ...nameIssues(spec.toName, 'liên kết')
  ]
  if (!isValidKey(key)) issues.push(issue('invalid-input', `Khóa liên kết "${key}" không hợp lệ`))
  else if (state.resolveLink(key) !== undefined) issues.push(issue('duplicate-key', `Khóa liên kết "${key}" đã được dùng`))
  return issues
}

export function specOf (state: ModelState, link: Association): LinkSpec {
  return {
    from: state.ownerKey(link.classA),
    to: state.ownerKey(link.classB),
    fromName: link.nameB,
    toName: link.nameA,
    fromMany: link.type !== '1:1',
    toMany: link.type === 'N:N'
  }
}

function pairText (state: ModelState, spec: LinkSpec): string {
  return `${quote(state.nameOf(mustType(state, spec.from)))} - ${quote(state.nameOf(mustType(state, spec.to)))}`
}

function cardinalityText (spec: LinkSpec): string {
  if (spec.fromMany && spec.toMany) return 'nhiều - nhiều'
  if (spec.fromMany || spec.toMany) return 'một - nhiều'
  return 'một - một'
}

function endsOf (state: ModelState, spec: LinkSpec): LinkEnds {
  return { from: mustType(state, spec.from)._id, to: mustType(state, spec.to)._id }
}

// Takes resolved ends so copyType can link a type created in the same step.
export function associationTx (factory: TxFactory, key: string, spec: LinkSpec, ends: LinkEnds, id: Ref<Association>): TxCUD<Doc> {
  // Association has no N:1; store it as 1:N read from the other side.
  const isFlipped = !spec.fromMany && spec.toMany
  const [classA, classB] = isFlipped ? [ends.to, ends.from] : [ends.from, ends.to]
  const [nameOnA, nameOnB] = isFlipped ? [spec.toName.trim(), spec.fromName.trim()] : [spec.fromName.trim(), spec.toName.trim()]
  const association: Data<Association> = {
    classA,
    classB,
    // nameB labels the field on A records (see linkInfo in describe.ts).
    nameB: nameOnA,
    nameA: nameOnB,
    type: spec.fromMany && spec.toMany ? 'N:N' : spec.fromMany || spec.toMany ? '1:N' : '1:1'
  }
  return factory.createTxCreateDoc(core.class.Association, core.space.Model, withServone(association, keyFields(key, spec.packKey)), id)
}

export const addLink: OperationModule<'addLink'> = {
  parse: (input) => ({
    op: 'addLink',
    key: input.optionalString('key'),
    from: input.string('from'),
    to: input.string('to'),
    fromName: input.string('fromName'),
    toName: input.string('toName'),
    fromMany: input.boolean('fromMany'),
    toMany: input.boolean('toMany'),
    packKey: input.optionalString('packKey')
  }),
  isInstalled: (op, { state }) => op.key !== undefined && isPackInstalled(state.resolveLink(op.key), op.packKey),
  validate: (op, { state }) => linkIssues(state, op.key ?? defaultLinkKey(op.from, op.to), op),
  inverse: (op) => [{ op: 'removeLink', link: op.key ?? defaultLinkKey(op.from, op.to) }],
  diff: (op, { state }) => [
    line(
      `Thêm liên kết ${pairText(state, op)} (${cardinalityText(op)}): trường ${quote(op.fromName.trim())} và ${quote(op.toName.trim())}`
    )
  ],
  risk: () => 'safe',
  expand: (op, { state, factory }) => [
    associationTx(factory, op.key ?? defaultLinkKey(op.from, op.to), op, endsOf(state, op), generateId())
  ],
  typeKeys: (op) => [op.from, op.to]
}

export const restoreLink: OperationModule<'restoreLink'> = {
  parse: (input) => ({
    op: 'restoreLink',
    key: input.string('key'),
    linkId: input.string('linkId'),
    from: input.string('from'),
    to: input.string('to'),
    fromName: input.string('fromName'),
    toName: input.string('toName'),
    fromMany: input.boolean('fromMany'),
    toMany: input.boolean('toMany'),
    packKey: input.optionalString('packKey')
  }),
  validate: (op, { state }) => {
    if (state.get(toRef(op.linkId)) !== undefined) return [issue('not-allowed', `Liên kết "${op.key}" đã tồn tại`)]
    return linkIssues(state, op.key, op)
  },
  inverse: (op) => [{ op: 'removeLink', link: op.key }],
  diff: (op, { state }) => [line(`Khôi phục liên kết ${pairText(state, op)} (${cardinalityText(op)})`)],
  risk: () => 'safe',
  // Same id: Relation docs keep their association ref, so connected records show again.
  expand: (op, { state, factory }) => [associationTx(factory, op.key, op, endsOf(state, op), toRef(op.linkId))],
  typeKeys: (op) => [op.from, op.to]
}

function mustLink (state: ModelState, key: string): Association {
  const found = state.resolveLink(key)
  if (found === undefined) throw new Error(`Link "${key}" disappeared after validation`)
  return found
}

export const removeLink: OperationModule<'removeLink'> = {
  parse: (input) => ({ op: 'removeLink', link: input.string('link') }),
  validate: (op, { state }) => {
    const link = state.resolveLink(op.link)
    if (link === undefined) return [issue('not-found', `Không tìm thấy liên kết "${op.link}"`)]
    const cardTypes = new Set<string>(state.types().map((it) => it._id))
    if (!cardTypes.has(link.classA) || !cardTypes.has(link.classB)) {
      return [issue('unsupported', `Liên kết "${op.link}" không nối hai biểu mẫu; hãy sửa trong cài đặt cũ`)]
    }
    if (link.modifiedBy === core.account.System) return [issue('system-protected', `Liên kết "${op.link}" có sẵn trong hệ thống`)]
    return []
  },
  measure: async (op, { state, client }) => {
    const link = mustLink(state, op.link)
    return (await client.findAll(core.class.Relation, { association: link._id }, { limit: 1, total: true })).total
  },
  inverse: (op, { state }) => {
    const link = mustLink(state, op.link)
    return [{ op: 'restoreLink', key: state.keyOf(link), linkId: link._id, ...specOf(state, link), packKey: readServone(link).servonePackKey }]
  },
  diff: (op, { state }, affected) => {
    const text = `Xóa liên kết ${pairText(state, specOf(state, mustLink(state, op.link)))}`
    return affected > 0
      ? [countedLine(`${text}: ${affected} cặp hồ sơ đang nối sẽ không còn hiện`, 'destructive', affected)]
      : [line(text)]
  },
  risk: (op, ctx, affected) => (affected > 0 ? 'destructive' : 'safe'),
  expand: (op, { state, factory }) => [factory.createTxRemoveDoc(core.class.Association, core.space.Model, mustLink(state, op.link)._id)],
  typeKeys: (op, { state }) => {
    const spec = specOf(state, mustLink(state, op.link))
    return [spec.from, spec.to]
  }
}
