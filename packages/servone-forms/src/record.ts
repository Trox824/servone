// What a form submission answered, kept on the issue as JSON in its `servoneFormAnswers` attribute (write.ts)
// so the answers stay readable after anyone edits the description or the mapped fields.
import type { Ref } from '@hcengineering/core'
import type { IssueTemplate } from '@hcengineering/tracker'
import { answerText, type Answer } from './answers'
import { isKind, isObject, type FormDefinition, type FormFieldKind, type Json } from './definition'

export const FORM_RECORD_VERSION = 1
const WEB_ADDRESS_PATTERN = /^https?:\/\/\S+$/

export interface RecordedAnswer {
  id: string
  label: string
  kind: FormFieldKind
  // Empty when the question was left unanswered.
  text: string
}

export interface FormRecord {
  version: typeof FORM_RECORD_VERSION
  template: Ref<IssueTemplate>
  submittedOn: number
  answers: RecordedAnswer[]
}

export function recordAnswers (
  definition: FormDefinition,
  answers: Answer[],
  template: Ref<IssueTemplate>,
  submittedOn: number
): FormRecord {
  const texts = new Map(answers.map((answer) => [answer.field.id, answerText(answer.value)]))
  return {
    version: FORM_RECORD_VERSION,
    template,
    submittedOn,
    answers: definition.fields.map((field) => ({
      id: field.id,
      label: field.label.trim(),
      kind: field.kind,
      text: texts.get(field.id) ?? ''
    }))
  }
}

export function serializeFormRecord (record: FormRecord): string {
  return JSON.stringify(record)
}

function readRecordedAnswer (json: Json): RecordedAnswer | undefined {
  if (!isObject(json)) return undefined
  const { id, label, kind, text } = json
  if (typeof id !== 'string' || typeof label !== 'string' || typeof text !== 'string') return undefined
  return typeof kind === 'string' && isKind(kind) ? { id, label, kind, text } : undefined
}

// Undefined for an issue not filed through a form, or a record this version can't read.
export function parseFormRecord (text: string | undefined): FormRecord | undefined {
  if (text === undefined || text === '') return undefined
  let json: Json
  try {
    json = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
  if (!isObject(json) || json.version !== FORM_RECORD_VERSION || !Array.isArray(json.answers)) return undefined
  const { template, submittedOn } = json
  if (typeof template !== 'string' || typeof submittedOn !== 'number') return undefined
  const answers: RecordedAnswer[] = []
  for (const entry of json.answers) {
    const answer = readRecordedAnswer(entry)
    if (answer === undefined) return undefined
    answers.push(answer)
  }
  // Written by recordAnswers from a template ref; JSON can't carry the brand.
  return { version: FORM_RECORD_VERSION, template: template as Ref<IssueTemplate>, submittedOn, answers }
}

// Only a whole-answer email or http(s) address becomes a link, so a typed `javascript:` never does.
export function answerHref (answer: RecordedAnswer): string | undefined {
  if (answer.text === '') return undefined
  if (answer.kind === 'email') return `mailto:${answer.text}`
  return WEB_ADDRESS_PATTERN.test(answer.text) ? answer.text : undefined
}
