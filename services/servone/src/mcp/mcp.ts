import { PlatformError } from '@hcengineering/platform'
import { McpServer } from '@modelcontextprotocol/server'
import { WAITING_APPROVAL } from '@servone/approvals'

import { CollabTimeoutError } from './collab'
import { type AnyTool, capText, ToolInputError } from './tool'
import type { WorkspaceSession } from './types'

const SERVER_INFO = { name: 'servone', version: '0.7.0' }
export const TOOL_FAILED_TEXT = 'Servone could not complete this request. Try again later.'
export const WAITING_APPROVAL_TEXT =
  'waiting_approval: this item is waiting for approval. It moves on once the approver decides.'

// Fields must never carry the bearer token.
export type Report = (event: string, fields: Record<string, string | number>) => void

export interface ToolOutcome {
  isError: boolean
  text: string
}

export async function runTool (
  session: WorkspaceSession,
  tool: AnyTool,
  args: Parameters<AnyTool['run']>[1],
  report: Report
): Promise<ToolOutcome> {
  try {
    return { isError: false, text: capText(await tool.run(session, args)) }
  } catch (error) {
    if (error instanceof ToolInputError) return { isError: true, text: error.message }
    if (error instanceof PlatformError && error.status.code === WAITING_APPROVAL) {
      return { isError: true, text: WAITING_APPROVAL_TEXT }
    }
    if (error instanceof CollabTimeoutError) {
      report('collaborator timeout', { tool: tool.name })
      return { isError: true, text: error.message }
    }
    // The SDK would echo error.message to the model; keep internals in our logs only.
    report('tool failed', { tool: tool.name, error: String(error) })
    return { isError: true, text: TOOL_FAILED_TEXT }
  }
}

export function buildMcpServer (session: WorkspaceSession, tools: AnyTool[], report: Report): McpServer {
  const server = new McpServer(SERVER_INFO)
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: tool.annotations },
      async (args) => {
        const outcome = await runTool(session, tool, args, report)
        return { isError: outcome.isError, content: [{ type: 'text', text: outcome.text }] }
      }
    )
  }
  return server
}
