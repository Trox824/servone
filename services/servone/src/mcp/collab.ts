import { getClient } from '@hcengineering/collaborator-client'
import type { WorkspaceUuid } from '@hcengineering/core'
import { jsonToMarkup, markupToJSON } from '@hcengineering/text-core'
import { markdownToMarkup, markupToMarkdown } from '@hcengineering/text-markdown'

import type { CollabText } from './types'

// The collaborator answers a document only after its pending save to the transactor lands, and it retries a
// failing save forever, so a stuck document would hold the tool call past MCP clients' 60 s request timeout.
export const COLLAB_TIMEOUT_MS = 15_000

export class CollabTimeoutError extends Error {
  constructor () {
    super('The editor service did not respond. Try again later.')
  }
}

export async function withTimeout<T> (work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new CollabTimeoutError())
    }, COLLAB_TIMEOUT_MS)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function createCollabText (workspace: WorkspaceUuid, token: string, collaboratorUrl: string): CollabText {
  const collaborator = getClient(workspace, token, collaboratorUrl)
  return {
    readMarkdown: async (doc, source) => {
      if (source === null) return ''
      return markupToMarkdown(markupToJSON(await withTimeout(collaborator.getMarkup(doc, source))))
    },
    writeMarkdown: async (doc, markdown) => {
      return await withTimeout(collaborator.createMarkup(doc, jsonToMarkup(markdownToMarkup(markdown))))
    },
    updateMarkdown: async (doc, markdown) => {
      await withTimeout(collaborator.updateMarkup(doc, jsonToMarkup(markdownToMarkup(markdown))))
    }
  }
}
