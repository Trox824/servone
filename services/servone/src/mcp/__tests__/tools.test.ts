import { ALL_TOOLS } from '../tools'

const WRITE_TOOL = /^(create|update|comment|post|apply|undo)_/

describe('ALL_TOOLS', () => {
  it('has 23 uniquely named snake_case tools', () => {
    const names = ALL_TOOLS.map((tool) => tool.name)
    expect(names).toHaveLength(23)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^[a-z_]+$/)
  })

  it('marks reads read-only and never marks writes read-only', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.annotations.readOnlyHint === true).toBe(!WRITE_TOOL.test(tool.name))
    }
  })

  it('exposes no delete tool', () => {
    expect(ALL_TOOLS.some((tool) => tool.name.startsWith('delete'))).toBe(false)
  })

  it('includes the record type and pack tools', () => {
    const names = ALL_TOOLS.map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'describe_record_types',
        'plan_config_change',
        'apply_config_change',
        'undo_config_change',
        'list_config_changes',
        'list_packs',
        'install_pack'
      ])
    )
  })
})
