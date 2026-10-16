import type { Ref } from '@hcengineering/core'
import type { IssueTemplate } from '@hcengineering/tracker'
import {
  FORM_RECORD_VERSION,
  templateForm,
  type FormDefinition,
  type FormField,
  type FormRecord,
  type FormTemplate,
  type RecordedAnswer
} from '@servone/forms'

export interface ItemForm {
  template: Ref<IssueTemplate>
  definition: FormDefinition
}

export interface DetailRow {
  answer: RecordedAnswer
  field?: FormField
}

export function detailAnswers (answers: RecordedAnswer[], title: string): RecordedAnswer[] {
  const shownTitle = title.trim()
  return answers.filter((answer) => answer.text === '' || answer.text.trim() !== shownTitle)
}

export function itemForm (
  templates: Array<Pick<FormTemplate, '_id' | 'servoneForm'>>,
  record: FormRecord | undefined
): ItemForm | undefined {
  const candidates = record === undefined ? templates : templates.filter((template) => template._id === record.template)
  for (const template of candidates) {
    const definition = templateForm(template)
    if (definition !== undefined) return { template: template._id, definition }
  }
  return undefined
}

function fieldAnswer (field: FormField, texts: Map<string, string>): RecordedAnswer {
  return { id: field.id, label: field.label.trim(), kind: field.kind, text: texts.get(field.id) ?? '' }
}

function removedAnswers (definition: FormDefinition | undefined, answers: RecordedAnswer[]): RecordedAnswer[] {
  const fields = definition?.fields ?? []
  return answers.filter((answer) => !fields.some((field) => field.id === answer.id))
}

export function detailRows (form: ItemForm | undefined, record: FormRecord | undefined, title: string): DetailRow[] {
  const recorded = record?.answers ?? []
  const texts = new Map(recorded.map((answer) => [answer.id, answer.text]))
  const current = (form?.definition.fields ?? [])
    .filter((field) => field.target.to !== 'title')
    .map((field) => ({ field, answer: fieldAnswer(field, texts) }))
  const removed = detailAnswers(removedAnswers(form?.definition, recorded), title).map((answer) => ({ answer }))
  return [...current, ...removed]
}

export function isMissing (row: DetailRow): boolean {
  return row.field?.isRequired === true && row.answer.text.trim() === ''
}

export function withAnswer (
  record: FormRecord | undefined,
  form: ItemForm,
  submittedOn: number,
  id: string,
  text: string
): FormRecord {
  const recorded = record?.answers ?? []
  const texts = new Map(recorded.map((answer) => [answer.id, answer.text])).set(id, text)
  return {
    version: FORM_RECORD_VERSION,
    template: record?.template ?? form.template,
    submittedOn: record?.submittedOn ?? submittedOn,
    answers: [
      ...form.definition.fields.map((field) => fieldAnswer(field, texts)),
      ...removedAnswers(form.definition, recorded)
    ]
  }
}
