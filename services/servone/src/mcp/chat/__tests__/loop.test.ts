import type Anthropic from '@anthropic-ai/sdk'
import type * as ConfigModule from '@servone/config'
import { getChange, plan, saveDraft } from '@servone/config'
import { z } from 'zod'

import { changeRecord, configOf, draftPlan, fakeSession } from '../../__tests__/fixtures'
import { TOOL_FAILED_TEXT } from '../../mcp'
import { type AnyTool, defineTool, ToolInputError } from '../../tool'
import { studioTools } from '../../tools/studio'
import { type ChatDeps, type ChatModel, MAX_MODEL_CALLS, MAX_OUTPUT_TOKENS, type ModelTurn, runChat } from '../loop'
import { SYSTEM_PROMPT } from '../prompt'

jest.mock('@servone/config', () => ({
  ...jest.requireActual<typeof ConfigModule>('@servone/config'),
  plan: jest.fn(),
  saveDraft: jest.fn(),
  getChange: jest.fn()
}))

type ToolInput = Record<string, string | number | Array<Record<string, string>>>

interface ScriptedModel extends ChatModel {
  calls: Anthropic.MessageCreateParamsNonStreaming[]
  signals: AbortSignal[]
}

function say (text: string): ModelTurn {
  return { content: [{ type: 'text', text, citations: null }], stop_reason: 'end_turn' }
}

function use (name: string, input: ToolInput, id = `use-${name}`): Anthropic.ToolUseBlock {
  return { type: 'tool_use', id, name, input, caller: { type: 'direct' } }
}

function callTools (...blocks: Anthropic.ToolUseBlock[]): ModelTurn {
  return { content: blocks, stop_reason: 'tool_use' }
}

function scripted (turns: ModelTurn[]): ScriptedModel {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = []
  const signals: AbortSignal[] = []
  return {
    calls,
    signals,
    create: async (params, signal) => {
      // The loop keeps appending to the same messages array after each call.
      calls.push(structuredClone(params))
      signals.push(signal)
      const turn = turns.shift()
      if (turn === undefined) throw new Error('model called too often')
      return turn
    }
  }
}

const runs: string[] = []

const describeTool = defineTool({
  name: 'describe_record_types',
  title: 'Describe record types',
  description: 'Lists record types',
  input: z.object({ type: z.string().optional() }),
  annotations: { readOnlyHint: true },
  run: async (_, args) => {
    runs.push(`describe:${args.type ?? ''}`)
    return 'nghi-phep "Đề nghị nghỉ phép"'
  }
})

const brokenTool = defineTool({
  name: 'list_config_changes',
  title: 'List config changes',
  description: 'Lists changes',
  input: z.object({}),
  annotations: { readOnlyHint: true },
  run: async () => {
    throw new Error('transactor down')
  }
})

const refusingTool = defineTool({
  name: 'list_packs',
  title: 'List packs',
  description: 'Lists packs',
  input: z.object({}),
  annotations: { readOnlyHint: true },
  run: async () => {
    throw new ToolInputError('Không có gói nào')
  }
})

function deps (model: ChatModel, tools: AnyTool[] = [describeTool, brokenTool, refusingTool]): ChatDeps & { report: jest.Mock } {
  return { model, modelId: 'claude-sonnet-5', tools, report: jest.fn() }
}

function lastToolResults (model: ScriptedModel): Anthropic.ToolResultBlockParam[] {
  const messages = model.calls[model.calls.length - 1].messages
  const last = messages[messages.length - 1]
  if (last.role !== 'user' || typeof last.content === 'string') throw new Error('no tool results')
  return last.content.flatMap((block) => (block.type === 'tool_result' ? [block] : []))
}

const LIVE = new AbortController().signal

const ASK = { turns: [{ role: 'user' as const, text: 'Thêm trường Nơi đến cho Đề nghị công tác' }] }

function studioPlanTool (): AnyTool {
  const found = studioTools.find((tool) => tool.name === 'plan_config_change')
  if (found === undefined) throw new Error('plan_config_change missing')
  return found
}

afterEach(() => {
  runs.length = 0
  jest.resetAllMocks()
})

describe('runChat request shape', () => {
  it('sends the system prompt, the offered tools, the output cap and caching', async () => {
    const model = scripted([say('Chào anh')])
    const reply = await runChat(deps(model), fakeSession(), ASK, LIVE)
    expect(reply).toEqual({ reply: 'Chào anh', stop: 'done', drafts: [] })
    const [params] = model.calls
    expect(params.model).toBe('claude-sonnet-5')
    expect(params.max_tokens).toBe(MAX_OUTPUT_TOKENS)
    expect(params.system).toBe(SYSTEM_PROMPT)
    expect(params.cache_control).toEqual({ type: 'ephemeral' })
    expect(params.tools?.map((tool) => ('name' in tool ? tool.name : ''))).toEqual([
      'describe_record_types',
      'list_config_changes',
      'list_packs'
    ])
    expect(params.messages).toEqual([{ role: 'user', content: 'Thêm trường Nơi đến cho Đề nghị công tác' }])
  })

  it('adds the open type to the last user turn only', async () => {
    const model = scripted([say('Được')])
    await runChat(deps(model), fakeSession(), {
      turns: [
        { role: 'user', text: 'Xin chào' },
        { role: 'assistant', text: 'Chào anh' },
        { role: 'user', text: 'Thêm trường Nơi đến' }
      ],
      typeKey: 'cong-tac'
    }, LIVE)
    expect(model.calls[0].messages).toEqual([
      { role: 'user', content: 'Xin chào' },
      { role: 'assistant', content: 'Chào anh' },
      { role: 'user', content: 'Thêm trường Nơi đến\n\n(Loại hồ sơ đang mở trong Studio có khóa "cong-tac".)' }
    ])
  })
})

describe('runChat tools', () => {
  it('runs the tools of one turn and answers them in one message', async () => {
    const model = scripted([
      callTools(use('describe_record_types', { type: 'nghi-phep' }, 'a'), use('list_packs', {}, 'b')),
      say('Xong')
    ])
    await runChat(deps(model), fakeSession(), ASK, LIVE)
    expect(runs).toEqual(['describe:nghi-phep'])
    const results = lastToolResults(model)
    expect(results.map((it) => [it.tool_use_id, it.is_error])).toEqual([
      ['a', false],
      ['b', true]
    ])
    expect(results[1].content).toBe('Không có gói nào')
  })

  it('refuses a tool the chat does not offer and never runs it', async () => {
    const applyRuns = jest.fn(async () => 'Applied')
    const applyTool = defineTool({
      name: 'apply_config_change',
      title: 'Apply',
      description: 'Applies',
      input: z.object({ changeId: z.string() }),
      annotations: { destructiveHint: true },
      run: applyRuns
    })
    const model = scripted([callTools(use('apply_config_change', { changeId: 'change-1' })), say('Anh bấm Áp dụng nhé')])
    // applyTool exists in the process but is not in the chat's tool list.
    expect(applyTool.name).toBe('apply_config_change')
    await runChat(deps(model), fakeSession(), ASK, LIVE)
    expect(applyRuns).not.toHaveBeenCalled()
    const [result] = lastToolResults(model)
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('apply_config_change is not available')
  })

  it('returns a bad tool input to the model without running the tool', async () => {
    const model = scripted([callTools(use('describe_record_types', { type: 5 })), say('Xin lỗi')])
    await runChat(deps(model), fakeSession(), ASK, LIVE)
    expect(runs).toEqual([])
    const [result] = lastToolResults(model)
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('type')
  })

  it('hides tool failures from the model and reports them', async () => {
    const model = scripted([callTools(use('list_config_changes', {})), say('Có lỗi')])
    const chatDeps = deps(model)
    await runChat(chatDeps, fakeSession(), ASK, LIVE)
    const [result] = lastToolResults(model)
    expect(result).toMatchObject({ is_error: true, content: TOOL_FAILED_TEXT })
    expect(chatDeps.report).toHaveBeenCalledWith('tool failed', { tool: 'list_config_changes', error: 'Error: transactor down' })
  })
})

describe('runChat limits', () => {
  it('stops after MAX_MODEL_CALLS model calls and keeps the drafts', async () => {
    jest.mocked(plan).mockResolvedValue(draftPlan())
    jest.mocked(saveDraft).mockResolvedValue(changeRecord())
    jest.mocked(getChange).mockResolvedValue(changeRecord())
    const operations = [{ op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác' }]
    const endless = Array.from({ length: MAX_MODEL_CALLS + 2 }, (_, index) =>
      callTools(use('plan_config_change', { operations }, `u${index}`))
    )
    const model = scripted(endless)
    const reply = await runChat(deps(model, [studioPlanTool()]), fakeSession(), ASK, LIVE)
    expect(model.calls).toHaveLength(MAX_MODEL_CALLS)
    expect(reply.stop).toBe('turn_limit')
    expect(reply.drafts).toHaveLength(MAX_MODEL_CALLS)
  })

  it.each([
    ['max_tokens', 'max_tokens'],
    ['refusal', 'refusal'],
    ['model_context_window_exceeded', 'max_tokens']
  ] as const)('never runs tools from a %s turn', async (stopReason, expectedStop) => {
    const model = scripted([{ content: [use('describe_record_types', { type: 'nghi-phep' })], stop_reason: stopReason }])
    const reply = await runChat(deps(model), fakeSession(), ASK, LIVE)
    expect(runs).toEqual([])
    expect(model.calls).toHaveLength(1)
    expect(reply).toEqual({ reply: '', stop: expectedStop, drafts: [] })
  })
})

describe('runChat drafts', () => {
  it('returns the drafts planned in this chat', async () => {
    const session = fakeSession()
    jest.mocked(plan).mockResolvedValue(draftPlan({ diff: changeRecord().diff }))
    jest.mocked(saveDraft).mockResolvedValue(changeRecord())
    jest.mocked(getChange).mockResolvedValue(changeRecord())
    const model = scripted([
      callTools(use('plan_config_change', { operations: [{ op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác' }] })),
      say('Tôi đã lập kế hoạch tạo Đề nghị công tác. Anh bấm "Áp dụng" dưới kế hoạch.')
    ])
    const reply = await runChat(deps(model, [studioPlanTool()]), session, ASK, LIVE)
    expect(reply.stop).toBe('done')
    expect(reply.drafts).toEqual([changeRecord()])
    expect(getChange).toHaveBeenCalledWith(configOf(session), 'change-1')
  })

  it('returns no draft when planning fails', async () => {
    jest
      .mocked(plan)
      .mockResolvedValue(draftPlan({ issues: [{ opIndex: 0, code: 'duplicate-key', message: 'Khóa cong-tac đã được dùng' }] }))
    const model = scripted([
      callTools(use('plan_config_change', { operations: [{ op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác' }] })),
      say('Khóa đã có')
    ])
    const reply = await runChat(deps(model, [studioPlanTool()]), fakeSession(), ASK, LIVE)
    expect(reply.drafts).toEqual([])
    expect(getChange).not.toHaveBeenCalled()
    expect(lastToolResults(model)[0].is_error).toBe(true)
  })
})

describe('runChat cancellation', () => {
  it('hands the request signal to the model', async () => {
    const controller = new AbortController()
    const model = scripted([say('Chào anh')])
    await runChat(deps(model), fakeSession(), ASK, controller.signal)
    expect(model.signals).toEqual([controller.signal])
  })

  it('runs no more tools and calls the model no more once the client is gone', async () => {
    const controller = new AbortController()
    const leavingTool = defineTool({
      name: 'leave_chat',
      title: 'Leave chat',
      description: 'Stands in for a client that disconnects mid-turn',
      input: z.object({}),
      annotations: { readOnlyHint: true },
      run: async () => {
        runs.push('leave')
        controller.abort()
        return 'ok'
      }
    })
    const model = scripted([callTools(use('leave_chat', {}, 'a'), use('describe_record_types', {}, 'b')), say('Xong')])
    const chat = runChat(deps(model, [leavingTool, describeTool]), fakeSession(), ASK, controller.signal)
    await expect(chat).rejects.toHaveProperty('name', 'AbortError')
    expect(runs).toEqual(['leave'])
    expect(model.calls).toHaveLength(1)
  })
})
