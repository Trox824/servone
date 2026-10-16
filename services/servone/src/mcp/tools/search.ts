import chunter from '@hcengineering/chunter'
import contact from '@hcengineering/contact'
import type { Class, Doc, Ref, SearchQuery } from '@hcengineering/core'
import drive from '@hcengineering/drive'
import tracker from '@hcengineering/tracker'
import { z } from 'zod'

import { defineTool, ToolInputError } from '../tool'

// @hcengineering/document is not a dependency of this service; id from plugins/document/src/plugin.ts.
const DOCUMENT_CLASS = 'document:class:Document' as Ref<Class<Doc>>
// Hits carry only titles; past a screenful the model should narrow the query instead.
const MAX_RESULTS = 30

const KIND_CLASS = {
  issue: tracker.class.Issue,
  message: chunter.class.ChatMessage,
  document: DOCUMENT_CLASS,
  person: contact.class.Person,
  file: drive.class.File
} satisfies Record<string, Ref<Class<Doc>>>

type Kind = keyof typeof KIND_CLASS

const KINDS: [Kind, ...Kind[]] = ['issue', 'message', 'document', 'person', 'file']

const searchWorkspace = defineTool({
  name: 'search_workspace',
  title: 'Search workspace',
  description:
    'Full-text search across everything the caller can see: issues, chat messages, documents, people, drive files. ' +
    'The query is matched as a word prefix. Optional kind narrows to one type. ' +
    'Output: one line per hit, "SHORT-ID Title  (class)  id", then "Showing N of TOTAL". Use get_issue with the SRV-12 style id for issue details.',
  input: z.object({
    query: z.string().trim().min(2),
    kind: z.enum(KINDS).optional(),
    limit: z.number().int().min(1).max(MAX_RESULTS).default(10)
  }),
  annotations: { readOnlyHint: true },
  run: async (session, args) => {
    const query: SearchQuery = { query: `${args.query}*` }
    if (args.kind !== undefined) {
      const hierarchy = session.client.getHierarchy()
      const root = KIND_CLASS[args.kind]
      if (!hierarchy.hasClass(root)) throw new ToolInputError(`Search kind "${args.kind}" is not available in this workspace`)
      query.classes = hierarchy.getDescendants(root)
    }
    const found = await session.rest.searchFulltext(query, { limit: args.limit })
    if (found.docs.length === 0) return `No results for "${args.query}"`
    const lines = found.docs.map((hit) => {
      const short = hit.shortTitle !== undefined && hit.shortTitle !== '' ? `${hit.shortTitle} ` : ''
      return `${short}${hit.title ?? '(untitled)'}  (${hit.doc._class})  ${hit.id}`
    })
    lines.push(`Showing ${found.docs.length} of ${found.total ?? found.docs.length}`)
    return lines.join('\n')
  }
})

export const searchTools = [searchWorkspace]
