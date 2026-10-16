// Server-rendered public form: plain HTML POST, no script, so outsiders never load the Huly app.
import { answerLimit, type AnswerProblem, type FormDefinition, type FormField } from '@servone/forms'

import { escapeHtml } from '../scheduler/email/render'

// Bots fill every input; a person never sees this one (the name looks worth filling in).
export const HONEYPOT_FIELD = 'website'
export const FIELD_PREFIX = 'f_'

// The URL holds the link secret, so no referrer leaves the page; framing is allowed for embeds.
export const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
}

const PROBLEM_TEXT: Record<AnswerProblem, string> = {
  required: 'This field is required.',
  too_long: 'This answer is too long.',
  invalid_number: 'Enter a number.',
  invalid_date: 'Enter a valid date.',
  invalid_email: 'Enter a valid email address.',
  invalid_option: 'Choose one of the options.'
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f7f7f8; --card: #fff; --text: #1b1b1f; --muted: #6b6b76; --border: #dcdce2; --accent: #5e6ad2; --error: #c93c37; }
@media (prefers-color-scheme: dark) { :root { --bg: #111113; --card: #1b1b1f; --text: #ececf1; --muted: #9a9aa6; --border: #33333b; --accent: #7c85e8; --error: #f07470; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 640px; margin: 0 auto; padding: 40px 16px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 28px 24px; }
h1 { font-size: 22px; font-weight: 600; margin: 0 0 24px; }
.field { margin-bottom: 20px; }
label { display: block; font-weight: 500; margin-bottom: 4px; }
.required { color: var(--error); }
.help { color: var(--muted); font-size: 13px; margin: 0 0 6px; }
input, textarea, select { width: 100%; font: inherit; color: inherit; background: transparent; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
textarea { min-height: 120px; resize: vertical; }
input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.invalid input, .invalid textarea, .invalid select { border-color: var(--error); }
.problem { color: var(--error); font-size: 13px; margin: 4px 0 0; }
.trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
button { font: inherit; font-weight: 500; color: #fff; background: var(--accent); border: 0; border-radius: 8px; padding: 10px 18px; cursor: pointer; }
p.note { color: var(--muted); margin: 0; }
`

function page (title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main><div class="card">${body}</div></main></body>
</html>`
}

function input (field: FormField, name: string, value: string, describedBy: string): string {
  const common = `id="${name}" name="${name}" maxlength="${answerLimit(field)}"${field.isRequired ? ' required' : ''}${describedBy}`
  switch (field.kind) {
    case 'longText':
      return `<textarea ${common}>${escapeHtml(value)}</textarea>`
    case 'select': {
      const options = (field.options ?? [])
        .map((option) => `<option${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`)
        .join('')
      return `<select id="${name}" name="${name}"${field.isRequired ? ' required' : ''}${describedBy}><option value="">Choose…</option>${options}</select>`
    }
    case 'number':
      return `<input type="text" inputmode="decimal" ${common} value="${escapeHtml(value)}">`
    case 'date':
      return `<input type="date" ${common} value="${escapeHtml(value)}">`
    case 'email':
      return `<input type="email" ${common} value="${escapeHtml(value)}">`
    case 'text':
      return `<input type="text" ${common} value="${escapeHtml(value)}">`
  }
}

function fieldBlock (field: FormField, value: string, problem: AnswerProblem | undefined): string {
  const name = `${FIELD_PREFIX}${field.id}`
  const help = field.help === undefined || field.help === '' ? '' : `<p class="help" id="${name}-help">${escapeHtml(field.help)}</p>`
  const error = problem === undefined ? '' : `<p class="problem" id="${name}-problem">${PROBLEM_TEXT[problem]}</p>`
  const ids = [help === '' ? '' : `${name}-help`, error === '' ? '' : `${name}-problem`].filter((id) => id !== '')
  const describedBy = ids.length === 0 ? '' : ` aria-describedby="${ids.join(' ')}"${error === '' ? '' : ' aria-invalid="true"'}`
  const mark = field.isRequired ? ' <span class="required" aria-hidden="true">*</span>' : ''
  return `<div class="field${error === '' ? '' : ' invalid'}">
<label for="${name}">${escapeHtml(field.label)}${mark}</label>
${help}${input(field, name, value, describedBy)}${error}
</div>`
}

export interface FormPage {
  title: string
  definition: FormDefinition
  values: ReadonlyMap<string, string>
  problems: ReadonlyMap<string, AnswerProblem>
}

export function renderFormPage ({ title, definition, values, problems }: FormPage): string {
  const fields = definition.fields
    .map((field) => fieldBlock(field, values.get(field.id) ?? '', problems.get(field.id)))
    .join('\n')
  return page(
    title,
    `<h1>${escapeHtml(title)}</h1>
<form method="post" novalidate>
${fields}
<div class="trap" aria-hidden="true"><label for="${HONEYPOT_FIELD}">Website</label><input id="${HONEYPOT_FIELD}" name="${HONEYPOT_FIELD}" tabindex="-1" autocomplete="off"></div>
<button type="submit">Submit</button>
</form>`
  )
}

export function renderThanksPage (title: string, reference: string | undefined): string {
  const note = reference === undefined ? '' : `<p class="note">Reference: ${escapeHtml(reference)}</p>`
  return page(title, `<h1>Thanks, your request was sent.</h1>${note}`)
}

export function renderMessagePage (heading: string, note: string): string {
  return page(heading, `<h1>${escapeHtml(heading)}</h1><p class="note">${escapeHtml(note)}</p>`)
}
