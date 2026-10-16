import { createMcpHandler } from '@modelcontextprotocol/server'
import { z } from 'zod'

import { buildMcpServer, type Report } from '../mcp'
import { defineTool, type AnyTool, MAX_TOOL_TEXT, ToolInputError } from '../tool'
import type { WorkspaceSession } from '../types'
import { fakeSession } from './fixtures'

interface RpcReply {
  result?: {
    tools?: Array<{ name: string, annotations?: { readOnlyHint?: boolean } }>
    content?: Array<{ type: string, text: string }>
    isError?: boolean
  }
  error?: { code: number, message: string }
}

// Legacy clients may answer with either a JSON body or a single-event SSE stream.
async function readReply (response: Response): Promise<RpcReply> {
  const body = await response.text()
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const dataLine = body.split('\n').find((line) => line.startsWith('data:'))
    if (dataLine === undefined) throw new Error(`No data in SSE body: ${body}`)
    return JSON.parse(dataLine.slice('data:'.length)) as RpcReply
  }
  return JSON.parse(body) as RpcReply
}

type ReportMock = jest.Mock<ReturnType<Report>, Parameters<Report>>

async function rpc (
  tools: AnyTool[],
  session: WorkspaceSession,
  method: string,
  params: object,
  report: ReportMock = jest.fn()
): Promise<RpcReply> {
  const handler = createMcpHandler(() => buildMcpServer(session, tools, report))
  const response = await handler.fetch(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    })
  )
  expect(response.status).toBe(200)
  return await readReply(response)
}

const echoInput = z.object({ word: z.string() })

function echoTool (run: (session: WorkspaceSession, args: z.infer<typeof echoInput>) => Promise<string>): AnyTool {
  return defineTool({
    name: 'echo',
    title: 'Echo',
    description: 'Echo a word',
    input: echoInput,
    annotations: { readOnlyHint: true },
    run
  })
}

const writeTool = defineTool({
  name: 'write_thing',
  title: 'Write thing',
  description: 'Writes',
  input: z.object({}),
  annotations: { readOnlyHint: false },
  run: async () => 'written'
})

describe('buildMcpServer', () => {
  it('lists every tool with its readOnlyHint', async () => {
    const reply = await rpc([echoTool(async () => ''), writeTool], fakeSession(), 'tools/list', {})
    const tools = reply.result?.tools ?? []
    expect(tools.map((tool) => tool.name)).toEqual(['echo', 'write_thing'])
    expect(tools.map((tool) => tool.annotations?.readOnlyHint)).toEqual([true, false])
  })

  it('passes parsed args and the session to run', async () => {
    const session = fakeSession()
    const run = jest.fn(async (_session: WorkspaceSession, args: { word: string }) => `said ${args.word}`)
    const reply = await rpc([echoTool(run)], session, 'tools/call', { name: 'echo', arguments: { word: 'hi' } })
    expect(run).toHaveBeenCalledWith(session, { word: 'hi' })
    expect(reply.result?.isError).not.toBe(true)
    expect(reply.result?.content).toEqual([{ type: 'text', text: 'said hi' }])
  })

  it('reports ToolInputError as an isError result', async () => {
    const tool = echoTool(async () => {
      throw new ToolInputError('Issue SRV-9 not found')
    })
    const report: ReportMock = jest.fn()
    const reply = await rpc([tool], fakeSession(), 'tools/call', { name: 'echo', arguments: { word: 'x' } }, report)
    expect(reply.result?.isError).toBe(true)
    expect(reply.result?.content).toEqual([{ type: 'text', text: 'Issue SRV-9 not found' }])
    expect(report).not.toHaveBeenCalled()
  })

  it('caps long output with a truncation note', async () => {
    const tool = echoTool(async () => 'x'.repeat(200_000))
    const reply = await rpc([tool], fakeSession(), 'tools/call', { name: 'echo', arguments: { word: 'x' } })
    const text = reply.result?.content?.[0].text ?? ''
    expect(text.startsWith('x'.repeat(MAX_TOOL_TEXT))).toBe(true)
    expect(text).toMatch(/\[truncated: 100000 more characters/)
  })

  it('hides internal errors from the model and reports them', async () => {
    const tool = echoTool(async () => {
      throw new Error('transactor down')
    })
    const report: ReportMock = jest.fn()
    const reply = await rpc([tool], fakeSession(), 'tools/call', { name: 'echo', arguments: { word: 'x' } }, report)
    expect(reply.result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'Servone could not complete this request. Try again later.' }]
    })
    expect(report).toHaveBeenCalledWith('tool failed', { tool: 'echo', error: 'Error: transactor down' })
  })

  it('rejects arguments that fail the input schema before run', async () => {
    const run = jest.fn(async () => 'never')
    const reply = await rpc([echoTool(run)], fakeSession(), 'tools/call', { name: 'echo', arguments: { word: 5 } })
    expect(run).not.toHaveBeenCalled()
    expect(reply.result?.isError).toBe(true)
  })
})
