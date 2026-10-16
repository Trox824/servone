import { parseDay } from '@servone/forms'
import { z } from 'zod'

import { MAX_TITLE_LEN, type IssueDraft, type IssuePatch } from '../tracker/issues'

export const MAX_BODY_BYTES = 256 * 1024 // a long markdown description plus JSON overhead
export const MAX_LABELS = 20 // sanity cap, far above what a person picks by hand
const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,255}$/

export type Rejection =
  | { isValid: false, error: 'invalid_json', message: string }
  | { isValid: false, error: 'invalid', field: string, message: string }

const title = z.string().trim().min(1).max(MAX_TITLE_LEN)
const priority = z.enum(['urgent', 'high', 'medium', 'low', 'none'])
const labels = z.array(z.string().trim().min(1)).max(MAX_LABELS)
const dueDay = z.string().transform((day, ctx) => {
  const at = parseDay(day)
  if (at === undefined) {
    ctx.addIssue({ code: 'custom', message: 'Use a real day as YYYY-MM-DD' })
    return z.NEVER
  }
  return at
})

const createBody = z.strictObject({
  project: z.string().trim().min(1),
  title,
  description: z.string().optional(),
  priority: priority.optional(),
  assignee: z.email().optional(),
  labels: labels.optional(),
  dueDate: dueDay.optional()
})

const patchBody = z.strictObject({
  title: title.optional(),
  description: z.string().optional(),
  status: z.string().trim().min(1).optional(),
  priority: priority.optional(),
  assignee: z.email().nullable().optional(),
  labels: labels.optional(),
  dueDate: dueDay.nullable().optional()
})

const commentBody = z.strictObject({ text: z.string().trim().min(1) })

function invalid (field: string, message: string): Rejection {
  return { isValid: false, error: 'invalid', field, message }
}

function rejectionOf (error: z.ZodError): Rejection {
  const [issue] = error.issues
  if (issue.code === 'unrecognized_keys') return invalid(issue.keys[0], `Unknown field "${issue.keys[0]}"`)
  const field = issue.path.length === 0 ? 'body' : issue.path.map(String).join('.')
  return invalid(field, issue.message)
}

function parseWith<S extends z.ZodType> (schema: S, body: string): { isValid: true, parsed: z.infer<S> } | Rejection {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) return { isValid: false, error: 'invalid_json', message: 'The body is not valid JSON' }
    throw error
  }
  const checked = schema.safeParse(json)
  return checked.success ? { isValid: true, parsed: checked.data } : rejectionOf(checked.error)
}

export function parseCreateBody (body: string): { isValid: true, draft: IssueDraft } | Rejection {
  const checked = parseWith(createBody, body)
  return checked.isValid ? { isValid: true, draft: checked.parsed } : checked
}

export function parsePatchBody (body: string): { isValid: true, patch: IssuePatch } | Rejection {
  const checked = parseWith(patchBody, body)
  if (!checked.isValid) return checked
  if (Object.keys(checked.parsed).length === 0) return invalid('body', 'Pass at least one field to change')
  return { isValid: true, patch: checked.parsed }
}

export function parseCommentBody (body: string): { isValid: true, text: string } | Rejection {
  const checked = parseWith(commentBody, body)
  return checked.isValid ? { isValid: true, text: checked.parsed.text } : checked
}

export function parseIdempotencyKey (header: string | string[] | undefined): { isValid: true, key: string | undefined } | Rejection {
  if (header === undefined) return { isValid: true, key: undefined }
  if (typeof header === 'string' && IDEMPOTENCY_KEY.test(header)) return { isValid: true, key: header }
  return invalid('Idempotency-Key', 'Use one key of 1 to 255 visible ASCII characters')
}
