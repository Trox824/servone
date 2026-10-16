import { z } from 'zod'

import { defineTool } from '../../tool'
import { ALL_TOOLS } from '../../tools'
import { CHAT_TOOL_NAMES, chatTools, toolDefinition } from '../tools'

const CHANGES_WORKSPACE = /^(apply|undo|install)_/

describe('chatTools', () => {
  it('offers exactly the read-only studio and pack tools', () => {
    const names = chatTools(ALL_TOOLS).map((tool) => tool.name)
    expect(names).toEqual(['describe_record_types', 'plan_config_change', 'list_config_changes', 'list_packs'])
    expect(names).toEqual([...CHAT_TOOL_NAMES])
    expect(names.some((name) => CHANGES_WORKSPACE.test(name))).toBe(false)
  })

  it('leaves apply, undo and install to MCP clients', () => {
    const registered = ALL_TOOLS.map((tool) => tool.name)
    expect(registered).toEqual(expect.arrayContaining(['apply_config_change', 'undo_config_change', 'install_pack']))
  })

  it('refuses a listed tool that is not read-only', () => {
    const writing = defineTool({
      name: 'describe_record_types',
      title: 'Describe',
      description: 'Pretends to read',
      input: z.object({}),
      annotations: { destructiveHint: true },
      run: async () => ''
    })
    expect(() => chatTools([writing])).toThrow('describe_record_types is not read-only')
  })

  it('fails at start when a listed tool is missing', () => {
    expect(() => chatTools([])).toThrow('describe_record_types is not registered')
  })
})

describe('toolDefinition', () => {
  it('turns each tool schema into an object input schema', () => {
    for (const tool of chatTools(ALL_TOOLS)) {
      const definition = toolDefinition(tool)
      expect(definition.name).toBe(tool.name)
      expect(definition.description).toBe(tool.description)
      expect(definition.input_schema.type).toBe('object')
      expect(definition.input_schema).not.toHaveProperty('$schema')
    }
  })

  it('keeps the operations array of plan_config_change', () => {
    const planTool = chatTools(ALL_TOOLS).find((tool) => tool.name === 'plan_config_change')
    if (planTool === undefined) throw new Error('plan_config_change missing')
    expect(toolDefinition(planTool).input_schema.properties).toMatchObject({ operations: { type: 'array' } })
  })
})
