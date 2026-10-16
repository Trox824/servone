import { getMetadata } from '@hcengineering/platform'
import presentation from '@hcengineering/presentation'
import type { Json } from '@servone/config'
import { servoneServiceUrl } from '../../chunter-resources/webhooks/api'
import { AssistantError, errorCodeFor, parseAssistantReply, type AssistantReply, type ChatRequestBody } from './assistant'

const CHAT_PATH = '/studio/chat'

async function post (url: string, body: ChatRequestBody): Promise<Response> {
  const token = getMetadata(presentation.metadata.Token) ?? ''
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch (err) {
    if (err instanceof TypeError) throw new AssistantError('network')
    throw err
  }
}

async function readJson (response: Response): Promise<Json> {
  try {
    return (await response.json()) as Json
  } catch (err) {
    if (err instanceof SyntaxError) return null
    throw err
  }
}

export async function askAssistant (body: ChatRequestBody): Promise<AssistantReply> {
  const base = await servoneServiceUrl('SERVONE_MCP_URL')
  if (base === undefined) throw new AssistantError('not_configured')
  const response = await post(`${base}${CHAT_PATH}`, body)
  const json = await readJson(response)
  if (!response.ok) throw new AssistantError(errorCodeFor(response.status, json))
  return parseAssistantReply(json)
}
