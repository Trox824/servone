import type { ToolAnnotations } from '@modelcontextprotocol/server'
import type { z } from 'zod'

import type { WorkspaceSession } from './types'

// Claude truncates tool results near 150k chars; stay well under so our own note survives.
export const MAX_TOOL_TEXT = 100_000

export interface Tool<S extends z.ZodObject> {
  name: string
  title: string
  description: string
  input: S
  annotations: ToolAnnotations
  run: (session: WorkspaceSession, args: z.infer<S>) => Promise<string>
}

export type AnyTool = Tool<z.ZodObject>

// Erases the schema generic so tools fit one array; re-parsing keeps run() typed without a cast.
export function defineTool<S extends z.ZodObject> (tool: Tool<S>): AnyTool {
  return { ...tool, run: async (session, args) => await tool.run(session, tool.input.parse(args)) }
}

// Problems the model can fix by changing its arguments; mcp.ts reports these as isError results.
export class ToolInputError extends Error {}

export function capText (text: string): string {
  if (text.length <= MAX_TOOL_TEXT) return text
  return `${text.slice(0, MAX_TOOL_TEXT)}\n\n[truncated: ${text.length - MAX_TOOL_TEXT} more characters, narrow the query or lower limit]`
}
