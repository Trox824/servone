import type { MasterTag } from '@hcengineering/card'
import core, { type AnyAttribute, type Doc, type Ref, type TxCUD } from '@hcengineering/core'
import view, { type BuildModelKey, type Viewlet, type ViewletDescriptor, type ViewOptionsModel } from '@hcengineering/view'
import { fieldKindOf } from '../fields'
import { NO_GROUPING } from '../ids'
import { labelText } from '../keys'
import type { JsonReader } from '../json'
import type { ViewSpec } from '../operations'
import type { OperationModule } from '../registry'
import type { ModelState } from '../state'
import type { DiffLine, Issue } from '../types'
import { activeTypeIssues, issue, line, mustField, mustType, quote } from './common'

type ConfigEntry = BuildModelKey | string

// Stock groupings of the Card List viewlet in models/card/src/index.ts.
const STOCK_GROUPING: Record<string, string> = {
  _class: 'Biểu mẫu',
  createdBy: 'Người tạo',
  modifiedBy: 'Người sửa',
  parent: 'Hồ sơ cha'
}

interface ColumnLayout {
  prefix: ConfigEntry[]
  fields: AnyAttribute[]
  suffix: ConfigEntry[]
}

function parseView (input: JsonReader): ViewSpec {
  const spec: ViewSpec = { columns: input.optionalStringArray('columns') }
  if (input.isNull('groupBy')) spec.groupBy = null
  else if (input.has('groupBy')) spec.groupBy = input.string('groupBy')
  return spec
}

function entryKey (entry: ConfigEntry): string {
  return typeof entry === 'string' ? entry : entry.key
}

function visibleFields (state: ModelState, type: MasterTag): AnyAttribute[] {
  return state.fieldsWithInherited(type._id).filter((it) => it.hidden !== true)
}

function mustViewlet (state: ModelState, type: MasterTag, descriptor: Ref<ViewletDescriptor>): Viewlet {
  const found = state.viewlet(type._id, descriptor)
  if (found === undefined) throw new Error(`Viewlet ${descriptor} of ${type._id} disappeared after validation`)
  return found
}

function layoutOf (state: ModelState, type: MasterTag, table: Viewlet): ColumnLayout {
  const byName = new Map(visibleFields(state, type).map((it) => [it.name, it]))
  const layout: ColumnLayout = { prefix: [], fields: [], suffix: [] }
  for (const entry of table.config) {
    const attr = byName.get(entryKey(entry))
    if (attr !== undefined) layout.fields.push(attr)
    else if (layout.fields.length === 0) layout.prefix.push(entry)
    else layout.suffix.push(entry)
  }
  return layout
}

function groupingOf (state: ModelState, type: MasterTag, list: Viewlet): string | null {
  const current = list.viewOptions?.groupBy[0]
  if (current === undefined || current === NO_GROUPING) return null
  const attr = visibleFields(state, type).find((it) => it.name === current)
  return attr !== undefined ? state.fieldKey(attr) : current
}

function groupValue (state: ModelState, type: MasterTag, list: Viewlet, key: string): string | undefined {
  const attr = state.resolveField(type, key)
  if (attr !== undefined) {
    const kind = fieldKindOf(attr, state).kind
    return kind === 'select' || kind === 'person' ? attr.name : undefined
  }
  return list.viewOptions?.groupBy.includes(key) === true ? key : undefined
}

// The server's async OnAttribute rewrites the type's viewlets for a new field after apply, duplicating what this plan set.
function newFieldIssues (state: ModelState, type: MasterTag, keys: string[]): Issue[] {
  return keys.flatMap((key) => {
    const attr = state.resolveField(type, key)
    if (attr === undefined || !state.wasCreated(attr._id)) return []
    return [issue('not-allowed', `Trường ${quote(labelText(attr.label))} vừa thêm trong thay đổi này; hãy áp dụng thêm trường trước rồi chỉnh hiển thị`)]
  })
}

function missingViewlet (state: ModelState, type: MasterTag, what: string): Issue {
  // The server creates viewlets when the type is created, so they do not exist inside the same plan.
  return issue('not-found', `${quote(state.nameOf(type))} chưa có ${what}; hãy áp dụng thay đổi tạo loại trước rồi chỉnh hiển thị`)
}

export const setView: OperationModule<'setView'> = {
  parse: (input) => ({ op: 'setView', type: input.string('type'), view: parseView(input.object('view')) }),
  validate: (op, { state }) => {
    const issues = activeTypeIssues(state, op.type)
    if (issues.length > 0) return issues
    const type = mustType(state, op.type)
    const { columns, groupBy } = op.view
    if (columns === undefined && groupBy === undefined) return [issue('invalid-input', 'Không có gì để đổi')]
    const named = [...(columns ?? [])]
    if (groupBy !== undefined && groupBy !== null) named.push(groupBy)
    const fresh = newFieldIssues(state, type, named)
    if (fresh.length > 0) return fresh
    if (columns !== undefined) {
      if (state.viewlet(type._id, view.viewlet.Table) === undefined) issues.push(missingViewlet(state, type, 'dạng bảng'))
      for (const key of columns) {
        const attr = state.resolveField(type, key)
        if (attr === undefined || attr.hidden === true) {
          issues.push(issue('not-found', `Không tìm thấy trường "${key}" trong ${quote(state.nameOf(type))}`))
        }
      }
      if (new Set(columns).size !== columns.length) issues.push(issue('invalid-input', 'Có cột bị lặp lại'))
    }
    if (groupBy !== undefined) {
      const list = state.viewlet(type._id, view.viewlet.List)
      if (list === undefined) {
        issues.push(missingViewlet(state, type, 'dạng danh sách'))
      } else if (groupBy !== null && groupValue(state, type, list, groupBy) === undefined) {
        issues.push(issue('not-allowed', `Không nhóm được theo "${groupBy}"; chỉ nhóm theo trường danh sách chọn, trường người hoặc nhóm có sẵn`))
      }
    }
    return issues
  },
  inverse: (op, { state }) => {
    const type = mustType(state, op.type)
    const previous: ViewSpec = {}
    if (op.view.columns !== undefined) {
      previous.columns = layoutOf(state, type, mustViewlet(state, type, view.viewlet.Table)).fields.map((it) => state.fieldKey(it))
    }
    if (op.view.groupBy !== undefined) previous.groupBy = groupingOf(state, type, mustViewlet(state, type, view.viewlet.List))
    return [{ op: 'setView', type: op.type, view: previous }]
  },
  diff: (op, { state }) => {
    const type = mustType(state, op.type)
    const name = quote(state.nameOf(type))
    const lines: DiffLine[] = []
    const { columns, groupBy } = op.view
    if (columns !== undefined) {
      const names = columns.map((key) => labelText(mustField(state, type, key).label))
      lines.push(line(names.length > 0 ? `Cột bảng của ${name}: ${names.join(', ')}` : `Bảng của ${name} không hiện cột trường nào`))
    }
    if (groupBy === null) lines.push(line(`Danh sách ${name} không nhóm`))
    if (groupBy !== undefined && groupBy !== null) {
      const attr = state.resolveField(type, groupBy)
      const label = attr !== undefined ? labelText(attr.label) : (STOCK_GROUPING[groupBy] ?? groupBy)
      lines.push(line(`Nhóm danh sách ${name} theo ${quote(label)}`))
    }
    return lines
  },
  risk: () => 'safe',
  expand: (op, { state, factory }) => {
    const type = mustType(state, op.type)
    const txes: Array<TxCUD<Doc>> = []
    const { columns, groupBy } = op.view
    if (columns !== undefined) {
      const table = mustViewlet(state, type, view.viewlet.Table)
      const layout = layoutOf(state, type, table)
      const config = [...layout.prefix, ...columns.map((key) => mustField(state, type, key).name), ...layout.suffix]
      txes.push(factory.createTxUpdateDoc(view.class.Viewlet, core.space.Model, table._id, { config }))
    }
    if (groupBy !== undefined) {
      const list = mustViewlet(state, type, view.viewlet.List)
      const stored = groupBy === null ? NO_GROUPING : groupValue(state, type, list, groupBy)
      if (stored === undefined) throw new Error(`Grouping "${String(groupBy)}" became invalid after validation`)
      const current = list.viewOptions ?? { groupBy: [], orderBy: [], other: [] }
      // groupBy[0] is the default grouping; the rest stay as choices in the view options menu.
      const viewOptions: ViewOptionsModel = { ...current, groupBy: [stored, ...current.groupBy.filter((it) => it !== stored)] }
      txes.push(factory.createTxUpdateDoc(view.class.Viewlet, core.space.Model, list._id, { viewOptions }))
    }
    return txes
  },
  typeKeys: (op) => [op.type]
}
