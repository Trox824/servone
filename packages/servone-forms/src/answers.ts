import type { FormDefinition, FormField } from './definition'

export const MAX_LONG_ANSWER_LENGTH = 10_000
export const MAX_SHORT_ANSWER_LENGTH = 500
export const MAX_TITLE_LENGTH = 255 // create issue dialog limit
// Noon UTC stays on the same calendar day in every zone from UTC-11 to UTC+11.
const DATE_HOUR_UTC = 12
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type AnswerValue =
  | { type: 'text', text: string }
  | { type: 'number', number: number }
  | { type: 'date', day: string, at: number }

export interface Answer {
  field: FormField
  value: AnswerValue
}

export type AnswerProblem = 'required' | 'too_long' | 'invalid_number' | 'invalid_date' | 'invalid_email' | 'invalid_option'

export type CheckedAnswers =
  | { isValid: true, answers: Answer[] }
  | { isValid: false, problems: Map<string, AnswerProblem> }

export function answerLimit (field: FormField): number {
  if (field.target.to === 'title') return MAX_TITLE_LENGTH
  return field.kind === 'longText' ? MAX_LONG_ANSWER_LENGTH : MAX_SHORT_ANSWER_LENGTH
}

export function parseDay (text: string): number | undefined {
  const match = DAY_PATTERN.exec(text)
  if (match === null) return undefined
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const at = Date.UTC(year, month - 1, day, DATE_HOUR_UTC)
  const parsed = new Date(at)
  const isRealDay = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  return isRealDay ? at : undefined
}

function readAnswer (field: FormField, text: string): AnswerValue | AnswerProblem {
  if (text.length > answerLimit(field)) return 'too_long'
  switch (field.kind) {
    case 'number': {
      const number = Number(text)
      return NUMBER_PATTERN.test(text) && Number.isFinite(number) ? { type: 'number', number } : 'invalid_number'
    }
    case 'date': {
      const at = parseDay(text)
      return at === undefined ? 'invalid_date' : { type: 'date', day: text, at }
    }
    case 'email':
      return EMAIL_PATTERN.test(text) ? { type: 'text', text } : 'invalid_email'
    case 'select':
      return (field.options ?? []).includes(text) ? { type: 'text', text } : 'invalid_option'
    case 'text':
    case 'longText':
      return { type: 'text', text }
  }
}

function normalize (field: FormField, raw: string): string {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  // Only long text keeps line breaks; a pasted newline in a one-line field would split its paragraph.
  return field.kind === 'longText' ? text : text.replace(/\s*\n\s*/g, ' ')
}

// `raw` maps field id to what the person typed; ids the form doesn't know are ignored.
export function checkAnswers (definition: FormDefinition, raw: ReadonlyMap<string, string>): CheckedAnswers {
  const answers: Answer[] = []
  const problems = new Map<string, AnswerProblem>()
  for (const field of definition.fields) {
    const text = normalize(field, raw.get(field.id) ?? '')
    if (text === '') {
      if (field.isRequired) problems.set(field.id, 'required')
      continue
    }
    const value = readAnswer(field, text)
    if (typeof value === 'string') problems.set(field.id, value)
    else answers.push({ field, value })
  }
  return problems.size === 0 ? { isValid: true, answers } : { isValid: false, problems }
}

export function answerText (value: AnswerValue): string {
  switch (value.type) {
    case 'text':
      return value.text
    case 'number':
      return String(value.number)
    case 'date':
      return value.day
  }
}
