import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import type { AnyTool } from '../tool'

// Apply, undo and install stay out: in Studio only the admin's "Áp dụng" button changes the workspace.
// install_pack is readOnlyHint too (it only drafts), so this fixed list, not the hint, is what keeps it out.
export const CHAT_TOOL_NAMES = ['describe_record_types', 'plan_config_change', 'list_config_changes', 'list_packs'] as const

export function chatTools (all: readonly AnyTool[]): AnyTool[] {
  return CHAT_TOOL_NAMES.map((name) => {
    const tool = all.find((it) => it.name === name)
    if (tool === undefined) throw new Error(`${name} is not registered`)
    // plan_config_change counts as read-only: it writes only a draft change record.
    if (tool.annotations.readOnlyHint !== true) throw new Error(`${name} is not read-only`)
    return tool
  })
}

// Same conversion the MCP SDK applies for tools/list (draft-2020-12, input side); $schema is not part of input_schema.
export function toolDefinition (tool: AnyTool): Anthropic.Tool {
  const { $schema, ...schema } = z.toJSONSchema(tool.input, { target: 'draft-2020-12', io: 'input' })
  return { name: tool.name, description: tool.description, input_schema: { ...schema, type: 'object' } }
}
