import type { MasterTag } from '@hcengineering/card'
import { linkedEnd } from './automation-link'
import { fieldKindOf } from './fields'
import { labelText } from './keys'
import type { AccessPreset, AutomationAction, AutomationSpec, AutomationTrigger, FieldValue, PersonTarget } from './operations'
import { quote } from './ops/common'
import { PRESET_LABEL } from './ops/set-access'
import type { ModelState } from './state'

export function presetName (preset: AccessPreset): string {
  return PRESET_LABEL[preset]
}

function fieldName (state: ModelState, owner: MasterTag | undefined, key: string): string {
  const attr = owner !== undefined ? state.resolveField(owner, key) : undefined
  return quote(attr !== undefined ? labelText(attr.label) : key)
}

function valueText (state: ModelState, owner: MasterTag | undefined, key: string, fieldValue: FieldValue): string {
  if (fieldValue === null) return 'trống'
  if (typeof fieldValue === 'boolean') return fieldValue ? 'Có' : 'Không'
  const attr = owner !== undefined ? state.resolveField(owner, key) : undefined
  const kind = attr !== undefined ? fieldKindOf(attr, state) : undefined
  if (kind?.kind === 'person') return 'người được chọn'
  if (kind?.kind === 'money' && typeof fieldValue === 'number') return `${fieldValue} ${kind.currency}`
  return typeof fieldValue === 'number' ? String(fieldValue) : `"${fieldValue}"`
}

function targetText (state: ModelState, type: MasterTag, target: PersonTarget): string {
  switch (target.kind) {
    case 'field':
      return `người ở trường ${fieldName(state, type, target.field)}`
    case 'people':
      return `${target.people.length} người được chọn`
    case 'preset':
      return `mọi ${quote(presetName(target.preset))} trong không gian của hồ sơ`
    case 'linked': {
      const link = state.resolveLink(target.link)
      const far = link === undefined ? undefined : linkedEnd(state, link, type)?.type
      const form = quote(far !== undefined ? state.nameOf(far) : target.link)
      return `người ở trường ${fieldName(state, far, target.field)} của hồ sơ ${form} được liên kết`
    }
    case 'initiator':
      return 'người tạo hồ sơ'
  }
}

function triggerText (state: ModelState, type: MasterTag, trigger: AutomationTrigger): string {
  switch (trigger.kind) {
    case 'created':
      return 'Khi tạo hồ sơ'
    case 'fieldChanged':
      return `Khi trường ${fieldName(state, type, trigger.field)} đổi thành ${valueText(state, type, trigger.field, trigger.to)}`
    case 'date': {
      const field = fieldName(state, type, trigger.field)
      if (trigger.offsetDays === 0) return `Vào ngày ${field}`
      const days = Math.abs(trigger.offsetDays)
      return trigger.offsetDays < 0 ? `Vào ${days} ngày trước ${field}` : `Vào ${days} ngày sau ${field}`
    }
  }
}

function actionText (state: ModelState, type: MasterTag, action: AutomationAction): string {
  switch (action.kind) {
    case 'requestApproval':
      return `gửi duyệt cho ${targetText(state, type, action.from)} (tất cả phải duyệt)`
    case 'setField':
      if (action.value === null) return `xóa giá trị ${fieldName(state, type, action.field)}`
      return `đặt ${fieldName(state, type, action.field)} = ${valueText(state, type, action.field, action.value)}`
    case 'createLinked': {
      const target = state.resolveType(action.type)
      const name = quote(target !== undefined ? state.nameOf(target) : action.type)
      const values = action.values.map(
        (it) => `${fieldName(state, target, it.field)} = ${valueText(state, target, it.field, it.value)}`
      )
      const detail = values.length > 0 ? ` (${values.join(', ')})` : ''
      return `tạo hồ sơ ${name} "${action.title.trim()}"${detail} liên kết với hồ sơ này`
    }
    case 'createTodo':
      return `giao việc "${action.title.trim()}" cho ${targetText(state, type, action.assignee)}`
    case 'lockField':
      return `khóa trường ${action.fields.map((it) => fieldName(state, type, it)).join(', ')}`
    case 'lockRecord':
      return 'khóa hồ sơ'
  }
}

function actionsText (state: ModelState, type: MasterTag, actions: AutomationAction[]): string {
  return actions.map((it) => actionText(state, type, it)).join(', ')
}

export function ruleSentences (state: ModelState, type: MasterTag, spec: AutomationSpec): string[] {
  const sentences = [`${triggerText(state, type, spec.trigger)} thì ${actionsText(state, type, spec.actions)}`]
  if (spec.onApproved !== undefined && spec.onApproved.length > 0) {
    sentences.push(`Khi được duyệt thì ${actionsText(state, type, spec.onApproved)}`)
  }
  if (spec.onRejected !== undefined && spec.onRejected.length > 0) {
    sentences.push(`Khi bị từ chối thì ${actionsText(state, type, spec.onRejected)}`)
  }
  return sentences
}
