import { applyChange, type ConfigSession, describe as describeConfig, type Pack, packStatus, plan, saveDraft } from '../../index'
import { applyOps, createWorkspace, sessionFor } from '../../__tests__/harness'
import { BUNDLED_PACKS, findPack } from '../index'

// Through saveDraft and applyChange, as Studio and MCP do: stored ops must keep their pack key.
async function install (session: ConfigSession, pack: Pack): Promise<void> {
  const draft = await plan(session, pack.operations)
  expect(draft.issues).toEqual([])
  const change = await saveDraft(session, draft)
  expect((await applyChange(session, change.id)).kind).toBe('applied')
}

function mustPack (key: string): Pack {
  const pack = findPack(key)
  if (pack === undefined) throw new Error(`No bundled pack ${key}`)
  return pack
}

describe.each(BUNDLED_PACKS.map((pack) => [pack.key, pack] as const))('pack %s', (_key, pack) => {
  it('installs into a fresh workspace, then re-installs as zero operations', async () => {
    const session = sessionFor(createWorkspace())
    await install(session, pack)
    const again = await plan(session, pack.operations)
    expect(again).toMatchObject({ ops: [], txes: [], diff: [], issues: [] })
    expect(packStatus(pack, await describeConfig(session))).toBe('installed')
  })

  it('creates every record type, field group, link and field it lists', async () => {
    const session = sessionFor(createWorkspace())
    await install(session, pack)
    const snapshot = await describeConfig(session)
    for (const op of pack.operations) {
      if (op.op === 'createType') expect(snapshot.types.find((it) => it.key === op.key)).toMatchObject({ name: op.name, packKey: pack.key })
      if (op.op === 'createGroup') expect(snapshot.groups.find((it) => it.key === op.key)).toMatchObject({ name: op.name, packKey: pack.key })
      if (op.op === 'addLink') {
        expect(snapshot.links.find((it) => it.key === op.key)).toMatchObject({ from: op.from, to: op.to, packKey: pack.key })
      }
    }
    const packFields = [...snapshot.types, ...snapshot.groups].flatMap((it) => it.fields).filter((it) => it.packKey === pack.key)
    expect(packFields).toHaveLength(pack.operations.filter((op) => op.op === 'addField').length)
  })
})

describe('bundled packs together', () => {
  it('install side by side into one workspace', async () => {
    const session = sessionFor(createWorkspace())
    for (const pack of BUNDLED_PACKS) await install(session, pack)
    const again = await plan(session, BUNDLED_PACKS.flatMap((pack) => pack.operations))
    expect(again).toMatchObject({ ops: [], issues: [] })
  })

  it('re-install adds back only a field that was removed', async () => {
    const assets = mustPack('tai-san-cong-ty')
    const session = sessionFor(createWorkspace())
    await install(session, assets)
    await applyOps(session, [{ op: 'removeField', type: 'tai-san', field: 'so-serial' }])
    expect(packStatus(assets, await describeConfig(session))).toBe('partial')
    const again = await plan(session, assets.operations)
    expect(again.issues).toEqual([])
    expect(again.ops).toEqual([expect.objectContaining({ op: 'addField', type: 'tai-san', key: 'so-serial', packKey: 'tai-san-cong-ty' })])
  })
})
