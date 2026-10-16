import type Anthropic from '@anthropic-ai/sdk'
import { type ChangeRecord, getChange, parseChangeId } from '@servone/config'

import { type Report, runTool } from '../mcp'
import type { AnyTool } from '../tool'
import { configSession } from '../tools/studio'
import type { WorkspaceSession } from '../types'
import { SYSTEM_PROMPT } from './prompt'
import { toolDefinition } from './tools'

// describe, plan, one re-plan after a refused operation and the answer take 4-5 calls; 8 leaves slack and bounds spend per message.
export const MAX_MODEL_CALLS = 8
// Non-streaming calls must stay under the SDK's HTTP timeout; a plan for a large type needs far less.
export const MAX_OUTPUT_TOKENS = 16_000

// Must match the first line plan_config_change returns (services/servone/src/mcp/tools/studio.ts).
const DRAFT_LINE = /^Drafted change (\S+) \(not applied yet\)\./

export type ModelTurn = Pick<Anthropic.Message, 'content' | 'stop_reason'>

export interface ChatModel {
  create: (params: Anthropic.MessageCreateParamsNonStreaming, signal: AbortSignal) => Promise<ModelTurn>
}

export type ChatStop = 'done' | 'turn_limit' | 'max_tokens' | 'refusal'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatRequest {
  turns: ChatTurn[]
  typeKey?: string
}

export interface ChatReply {
  reply: string
  stop: ChatStop
  drafts: ChangeRecord[]
}

export interface ChatDeps {
  model: ChatModel
  modelId: string
  tools: AnyTool[]
  report: Report
}

function openingMessages (request: ChatRequest): Anthropic.MessageParam[] {
  const lastIndex = request.turns.length - 1
  return request.turns.map((turn, index) => {
    if (index !== lastIndex || request.typeKey === undefined) return { role: turn.role, content: turn.text }
    return { role: turn.role, content: `${turn.text}\n\n(Loại hồ sơ đang mở trong Studio có khóa "${request.typeKey}".)` }
  })
}

function replyText (turn: ModelTurn): string {
  return turn.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n\n')
    .trim()
}

function toolError (block: Anthropic.ToolUseBlock, text: string): Anthropic.ToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: text }
}

async function answerToolUse (
  deps: ChatDeps,
  session: WorkspaceSession,
  block: Anthropic.ToolUseBlock,
  drafted: string[]
): Promise<Anthropic.ToolResultBlockParam> {
  const tool = deps.tools.find((it) => it.name === block.name)
  if (tool === undefined) {
    return toolError(block, `Tool ${block.name} is not available here. Only the admin applies changes, with the "Áp dụng" button.`)
  }
  const args = tool.input.safeParse(block.input)
  if (!args.success) return toolError(block, `Invalid input for ${tool.name}: ${args.error.message}`)
  const outcome = await runTool(session, tool, args.data, deps.report)
  const draftId = outcome.isError ? undefined : DRAFT_LINE.exec(outcome.text)?.[1]
  if (draftId !== undefined) drafted.push(draftId)
  return { type: 'tool_result', tool_use_id: block.id, is_error: outcome.isError, content: outcome.text }
}

// Rejects with signal.reason once the client is gone, so no further tool or model call is paid for.
export async function runChat (
  deps: ChatDeps,
  session: WorkspaceSession,
  request: ChatRequest,
  signal: AbortSignal
): Promise<ChatReply> {
  const tools = deps.tools.map(toolDefinition)
  const messages = openingMessages(request)
  const drafted: string[] = []
  let stop: ChatStop = 'turn_limit'
  let reply = ''
  for (let call = 0; call < MAX_MODEL_CALLS; call++) {
    signal.throwIfAborted()
    const turn = await deps.model.create(
      {
        model: deps.modelId,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        tools,
        messages,
        cache_control: { type: 'ephemeral' }
      },
      signal
    )
    reply = replyText(turn)
    // A cut-off or refused turn can carry a partial tool input that still parses; never run it.
    if (turn.stop_reason === 'max_tokens' || turn.stop_reason === 'refusal') {
      stop = turn.stop_reason
      break
    }
    if (turn.stop_reason === 'model_context_window_exceeded') {
      stop = 'max_tokens'
      break
    }
    const uses = turn.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    if (uses.length === 0) {
      stop = 'done'
      break
    }
    messages.push({ role: 'assistant', content: turn.content })
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    // In order: two plans in one turn must be saved in the order the model wrote them.
    for (const block of uses) {
      signal.throwIfAborted()
      toolResults.push(await answerToolUse(deps, session, block, drafted))
    }
    messages.push({ role: 'user', content: toolResults })
  }
  const config = configSession(session)
  const drafts = await Promise.all(drafted.map(async (id) => await getChange(config, parseChangeId(id))))
  return { reply, stop, drafts }
}
