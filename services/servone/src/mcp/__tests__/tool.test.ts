import { z } from 'zod'

import { capText, defineTool, MAX_TOOL_TEXT } from '../tool'
import { fakeSession } from './fixtures'

describe('capText', () => {
  it('passes short text through', () => {
    expect(capText('abc')).toBe('abc')
  })

  it('truncates long text with a note', () => {
    const out = capText('x'.repeat(MAX_TOOL_TEXT + 10))
    expect(out.startsWith('x'.repeat(MAX_TOOL_TEXT))).toBe(true)
    expect(out).toContain('[truncated: 10 more characters')
  })
})

describe('defineTool', () => {
  it('parses args with the tool schema before run', async () => {
    const tool = defineTool({
      name: 'echo',
      title: 'Echo',
      description: 'Echo',
      input: z.object({ limit: z.number().default(5) }),
      annotations: { readOnlyHint: true },
      run: async (_session, args) => `limit=${args.limit}`
    })
    expect(await tool.run(fakeSession(), {})).toBe('limit=5')
  })
})
