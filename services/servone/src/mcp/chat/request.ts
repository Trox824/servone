import type { Json } from '@servone/config'
import { z } from 'zod'

import type { ChatRequest, ChatTurn } from './loop'

// 20 turns of 4000 characters of Vietnamese UTF-8 stay under this with room for JSON overhead.
export const MAX_BODY_BYTES = 256 * 1024
// Must match MAX_HISTORY_TURNS in packages/servone-ui/src/plugins/card-resources/studio/assistant.ts.
export const MAX_TURNS = 20
// Must match MAX_TEXT_CHARS in the same front file; a request is a few sentences, not a pasted document.
export const MAX_TEXT_CHARS = 4000
// Record type keys are slugs of type names (packages/servone-config/src/keys.ts); real ones are far shorter.
const MAX_KEY_CHARS = 200

const turnInput = z.strictObject({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS)
})

const chatInput = z.strictObject({
  messages: z.array(turnInput).min(1).max(MAX_TURNS),
  typeKey: z.string().trim().min(1).max(MAX_KEY_CHARS).optional()
})

export type ParsedChat = { isValid: true, request: ChatRequest } | { isValid: false, error: 'invalid_json' | 'invalid_request' }

// The Messages API wants alternating roles; a failed send leaves two user turns in a row.
export function mergeTurns (turns: ChatTurn[]): ChatTurn[] {
  const merged: ChatTurn[] = []
  for (const turn of turns) {
    const last = merged[merged.length - 1]
    if (last !== undefined && last.role === turn.role) merged[merged.length - 1] = { role: turn.role, text: `${last.text}\n\n${turn.text}` }
    else merged.push({ role: turn.role, text: turn.text })
  }
  return merged
}

export function parseChatRequest (body: string): ParsedChat {
  let json: Json
  try {
    json = JSON.parse(body) as Json
  } catch (error) {
    if (error instanceof SyntaxError) return { isValid: false, error: 'invalid_json' }
    throw error
  }
  const parsed = chatInput.safeParse(json)
  if (!parsed.success) return { isValid: false, error: 'invalid_request' }
  const turns = mergeTurns(parsed.data.messages)
  if (turns[0].role !== 'user' || turns[turns.length - 1].role !== 'user') return { isValid: false, error: 'invalid_request' }
  const request: ChatRequest = { turns }
  if (parsed.data.typeKey !== undefined) request.typeKey = parsed.data.typeKey
  return { isValid: true, request }
}
