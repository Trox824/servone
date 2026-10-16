import { PlatformError, Severity, Status } from '@hcengineering/platform'
import { WAITING_APPROVAL } from '@servone/approvals'
import { z } from 'zod'

import { CollabTimeoutError } from '../collab'
import { runTool, TOOL_FAILED_TEXT, WAITING_APPROVAL_TEXT } from '../mcp'
import { defineTool, MAX_TOOL_TEXT, ToolInputError } from '../tool'
import { fakeSession } from './fixtures'

function toolThat (run: () => Promise<string>): ReturnType<typeof defineTool> {
  return defineTool({
    name: 'echo',
    title: 'Echo',
    description: 'Echoes',
    input: z.object({}),
    annotations: { readOnlyHint: true },
    run
  })
}

describe('runTool', () => {
  it('returns the capped tool text', async () => {
    const report = jest.fn()
    const outcome = await runTool(fakeSession(), toolThat(async () => 'x'.repeat(MAX_TOOL_TEXT + 10)), {}, report)
    expect(outcome.isError).toBe(false)
    expect(outcome.text).toContain('[truncated:')
    expect(report).not.toHaveBeenCalled()
  })

  it('passes input problems to the model', async () => {
    const outcome = await runTool(
      fakeSession(),
      toolThat(async () => {
        throw new ToolInputError('Record type "x" not found')
      }),
      {},
      jest.fn()
    )
    expect(outcome).toEqual({ isError: true, text: 'Record type "x" not found' })
  })

  it('hides internal failures and reports them', async () => {
    const report = jest.fn()
    const outcome = await runTool(
      fakeSession(),
      toolThat(async () => {
        throw new Error('transactor down')
      }),
      {},
      report
    )
    expect(outcome).toEqual({ isError: true, text: TOOL_FAILED_TEXT })
    expect(report).toHaveBeenCalledWith('tool failed', { tool: 'echo', error: 'Error: transactor down' })
  })

  it('reports collaborator timeouts with their own text', async () => {
    const report = jest.fn()
    const timeout = new CollabTimeoutError()
    const outcome = await runTool(
      fakeSession(),
      toolThat(async () => {
        throw timeout
      }),
      {},
      report
    )
    expect(outcome).toEqual({ isError: true, text: timeout.message })
    expect(report).toHaveBeenCalledWith('collaborator timeout', { tool: 'echo' })
  })

  it('tells the model when the approval guard refuses a change', async () => {
    const outcome = await runTool(
      fakeSession(),
      toolThat(async () => {
        throw new PlatformError(new Status(Severity.ERROR, WAITING_APPROVAL, {}))
      }),
      {},
      jest.fn()
    )
    expect(outcome).toEqual({ isError: true, text: WAITING_APPROVAL_TEXT })
    expect(outcome.text).toMatch(/^waiting_approval/)
  })
})
