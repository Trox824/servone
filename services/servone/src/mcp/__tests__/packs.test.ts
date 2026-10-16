import type * as ConfigModule from '@servone/config'
import { type ConfigSnapshot, describe as describeConfig, findPack, type Pack, plan, saveDraft } from '@servone/config'

import { ToolInputError, type AnyTool } from '../tool'
import { packTools } from '../tools/packs'
import { changeRecord, configOf, draftPlan, fakeSession } from './fixtures'

// Session-bound core calls are faked; pack parsing and packStatus stay real.
jest.mock('@servone/config', () => ({
  ...jest.requireActual<typeof ConfigModule>('@servone/config'),
  describe: jest.fn(),
  plan: jest.fn(),
  saveDraft: jest.fn()
}))

const EMPTY: ConfigSnapshot = { version: 'v1', types: [], groups: [], links: [], spaces: [] }

function tool (name: string): AnyTool {
  const found = packTools.find((it) => it.name === name)
  if (found === undefined) throw new Error(`no tool ${name}`)
  return found
}

function requests (): Pack {
  const pack = findPack('de-nghi-noi-bo')
  if (pack === undefined) throw new Error('no requests pack')
  return pack
}

afterEach(() => {
  jest.resetAllMocks()
})

describe('list_packs', () => {
  it('lists bundled packs with what they create and their install state', async () => {
    jest.mocked(describeConfig).mockResolvedValue({
      ...EMPTY,
      types: [
        {
          key: 'nghi-phep',
          name: 'Đề nghị nghỉ phép',
          isSystem: false,
          isArchived: false,
          spaces: [],
          fields: [],
          access: [],
          packKey: 'de-nghi-noi-bo',
          automations: []
        }
      ]
    })
    const out = await tool('list_packs').run(fakeSession(), {})
    expect(out).toContain('Packs (3); install one with install_pack:')
    expect(out).toContain('de-nghi-noi-bo "Đề nghị nội bộ" v1 (Mọi ngành): partly installed (install_pack adds what is missing)')
    expect(out).toContain(
      '  creates record types Đề nghị nghỉ phép, Đề nghị công tác, Đề nghị tạm ứng, Đề nghị văn phòng phẩm; fields: 39, links: 1, field groups: 0'
    )
    expect(out).toContain('hop-dong-khach-hang "Hợp đồng & khách hàng" v1 (Thương mại, dịch vụ): not installed')
    expect(out).toContain('tai-san-cong-ty "Tài sản công ty" v1 (Mọi ngành): not installed')
    expect(out).not.toMatch(/MasterTag|Attribute|Association|mixin|Enum/)
  })
})

describe('install_pack', () => {
  it('drafts the pack operations as one change', async () => {
    const session = fakeSession()
    const pack = requests()
    jest.mocked(plan).mockResolvedValue(draftPlan({ ops: pack.operations }))
    jest.mocked(saveDraft).mockResolvedValue(changeRecord())
    const out = await tool('install_pack').run(session, { pack: 'de-nghi-noi-bo' })
    expect(plan).toHaveBeenCalledWith(configOf(session), pack.operations)
    expect(out).toContain('Drafted change change-1 to install pack de-nghi-noi-bo "Đề nghị nội bộ" (not applied yet).')
    expect(out).toContain('Risk: safe')
    expect(out).toContain('Next: call apply_config_change with changeId "change-1".')
    expect(out).not.toContain('skipped')
  })

  it('says how many items this pack already installed', async () => {
    const pack = requests()
    jest.mocked(plan).mockResolvedValue(draftPlan({ ops: pack.operations.slice(0, 3) }))
    jest.mocked(saveDraft).mockResolvedValue(changeRecord())
    const out = await tool('install_pack').run(fakeSession(), { pack: 'de-nghi-noi-bo' })
    const total = pack.operations.length
    expect(out).toContain(`${total - 3} of ${total} items were already installed by this pack and are skipped.`)
  })

  it('saves nothing when the pack is already installed', async () => {
    jest.mocked(plan).mockResolvedValue(draftPlan({ ops: [] }))
    const out = await tool('install_pack').run(fakeSession(), { pack: 'de-nghi-noi-bo' })
    expect(out).toBe('Pack de-nghi-noi-bo "Đề nghị nội bộ" is already installed; nothing to add.')
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('reports planning problems and saves nothing', async () => {
    jest.mocked(plan).mockResolvedValue(
      draftPlan({ ops: requests().operations, issues: [{ opIndex: 0, code: 'duplicate-key', message: 'Khóa "nghi-phep" đã được dùng' }] })
    )
    const run = tool('install_pack').run(fakeSession(), { pack: 'de-nghi-noi-bo' })
    await expect(run).rejects.toBeInstanceOf(ToolInputError)
    await expect(run).rejects.toThrow(
      'Pack "de-nghi-noi-bo" cannot be installed; nothing was saved.\n- operation 1: Khóa "nghi-phep" đã được dùng'
    )
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('names the known packs for an unknown key', async () => {
    const run = tool('install_pack').run(fakeSession(), { pack: 'ban-le' })
    await expect(run).rejects.toBeInstanceOf(ToolInputError)
    await expect(run).rejects.toThrow('Pack "ban-le" not found. Known: de-nghi-noi-bo, hop-dong-khach-hang, tai-san-cong-ty')
    expect(plan).not.toHaveBeenCalled()
  })
})
