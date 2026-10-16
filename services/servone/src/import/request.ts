import { z } from 'zod'

import type { Json } from '../http-json'

export const MAX_IMPORT_BODY_BYTES = 8 * 1024 * 1024

const personRef = z.object({
  name: z.string().optional(),
  email: z.string().optional()
})

const importStatus = z.enum(['backlog', 'todo', 'inProgress', 'done', 'canceled'])

const issue = z.object({
  key: z.string().min(1),
  parent: z.string().min(1).optional(),
  title: z.string(),
  description: z.string(),
  status: importStatus,
  sourceStatus: z.string(),
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']),
  assignee: personRef.optional(),
  creator: personRef.optional(),
  labels: z.array(z.string()),
  estimateHours: z.number().nonnegative().optional(),
  dueDate: z.number().optional(),
  createdOn: z.number().optional(),
  comments: z.array(
    z.object({
      author: personRef.optional(),
      date: z.number().optional(),
      text: z.string()
    })
  )
})

const message = z.object({
  key: z.string().min(1),
  thread: z.string().min(1).optional(),
  author: personRef.optional(),
  date: z.number(),
  text: z.string()
})

const importDoc = z.object({
  key: z.string().min(1),
  title: z.string(),
  markdown: z.string(),
  parent: z.string().min(1).optional()
})

const importRequest = z.discriminatedUnion('op', [
  z.object({ op: z.literal('match'), people: z.array(personRef) }),
  z.object({ op: z.literal('project'), name: z.string().trim().min(1) }),
  z.object({ op: z.literal('issues'), project: z.string().min(1), issues: z.array(issue) }),
  z.object({
    op: z.literal('channel'),
    channel: z.object({
      name: z.string().trim().min(1),
      topic: z.string(),
      isPrivate: z.boolean(),
      isArchived: z.boolean(),
      members: z.array(personRef)
    })
  }),
  z.object({ op: z.literal('messages'), channel: z.string().min(1), messages: z.array(message) }),
  z.object({ op: z.literal('teamspace'), name: z.string().trim().min(1) }),
  z.object({ op: z.literal('docs'), teamspace: z.string().min(1), docs: z.array(importDoc) })
])

export type ImportRequest = z.infer<typeof importRequest>
export type PersonRef = z.infer<typeof personRef>
export type ImportStatus = z.infer<typeof importStatus>
export type IssueImport = z.infer<typeof issue>
export type MessageImport = z.infer<typeof message>
export type DocImport = z.infer<typeof importDoc>

export type ParsedImport = { request: ImportRequest } | { error: 'invalid_json' } | { error: 'invalid', field: string }

export function parseImportRequest (body: string): ParsedImport {
  let json: Json
  try {
    json = JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) return { error: 'invalid_json' }
    throw error
  }
  const parsed = importRequest.safeParse(json)
  if (parsed.success) return { request: parsed.data }
  return { error: 'invalid', field: parsed.error.issues[0]?.path.map(String).join('.') ?? '' }
}
