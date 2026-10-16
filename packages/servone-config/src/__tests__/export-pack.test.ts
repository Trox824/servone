import type { ConfigSession } from '../client'
import { describe as describeConfig } from '../describe'
import { exportPack } from '../export-pack'
import type { Operation } from '../operations'
import { parsePackJson, type PackMeta } from '../pack'
import { plan } from '../plan'
import type { ConfigSnapshot } from '../types'
import { applyOps, createWorkspace, sessionFor } from './harness'

const SOURCE: Operation[] = [
  { op: 'createType', key: 'khach-hang', name: 'Khách hàng' },
  { op: 'createType', key: 'khach-hang-vip', name: 'Khách hàng VIP', basedOn: 'khach-hang' },
  { op: 'createType', key: 'hop-dong', name: 'Hợp đồng' },
  {
    op: 'addField',
    type: 'khach-hang',
    key: 'loai',
    name: 'Loại khách hàng',
    kind: { kind: 'select', options: ['Doanh nghiệp', 'Cá nhân'] },
    required: true
  },
  { op: 'addField', type: 'hop-dong', key: 'gia-tri', name: 'Giá trị', kind: { kind: 'money', currency: 'VND' } },
  { op: 'addField', type: 'hop-dong', key: 'phu-trach', name: 'Người phụ trách', kind: { kind: 'person' } },
  { op: 'addField', type: 'hop-dong', key: 'so-hop-dong', name: 'Số hợp đồng', kind: { kind: 'autoNumber', prefix: 'HD' } },
  { op: 'createGroup', key: 'xuat-hoa-don', name: 'Thông tin xuất hóa đơn', types: ['khach-hang'] },
  { op: 'addField', type: 'xuat-hoa-don', key: 'email-hoa-don', name: 'Email nhận hóa đơn', kind: { kind: 'text' } },
  {
    op: 'addLink',
    key: 'khach-hang-hop-dong',
    from: 'khach-hang',
    to: 'hop-dong',
    fromName: 'Hợp đồng',
    toName: 'Khách hàng',
    fromMany: true,
    toMany: false
  }
]

const META: PackMeta = { key: 'ban-hang', version: 1, name: 'Bán hàng', description: 'Khách hàng và hợp đồng', industry: 'Thương mại' }
const CHOSEN = ['khach-hang-vip', 'khach-hang', 'hop-dong']

async function source (): Promise<ConfigSession> {
  const session = sessionFor(createWorkspace())
  await applyOps(session, SOURCE)
  return session
}

// Pack keys differ by design (the source types are customer types); everything else must match.
function comparable (snapshot: ConfigSnapshot): string {
  const fields = (list: ConfigSnapshot['types'][number]['fields']): string[] =>
    list.filter((it) => !it.isBuiltIn).map((it) => `${it.key}|${it.name}|${JSON.stringify(it.kind)}|${it.isRequired}`)
  return JSON.stringify({
    types: snapshot.types
      .filter((it) => CHOSEN.includes(it.key))
      .map((it) => ({ key: it.key, name: it.name, basedOn: it.basedOn, fields: fields(it.fields) }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    groups: snapshot.groups.map((it) => ({ key: it.key, name: it.name, type: it.type, fields: fields(it.fields) })),
    links: snapshot.links
      .filter((it) => CHOSEN.includes(it.from))
      .map((it) => ({ key: it.key, from: it.from, to: it.to, fromName: it.fromName, toName: it.toName, fromMany: it.fromMany, toMany: it.toMany }))
  })
}

function systemKeyOf (snapshot: ConfigSnapshot): string {
  const found = snapshot.types.find((it) => it.isSystem)
  if (found === undefined) throw new Error('model-all has no system record type')
  return found.key
}

describe('exportPack', () => {
  it('exports types parents first with their fields, groups and links', async () => {
    const pack = await exportPack(await source(), CHOSEN, META)
    expect(pack).toMatchObject({ key: 'ban-hang', version: 1, name: 'Bán hàng', industry: 'Thương mại' })
    expect(pack.operations.flatMap((op) => (op.op === 'createType' ? [op.key] : []))).toEqual(['khach-hang', 'khach-hang-vip', 'hop-dong'])
    expect(pack.operations.find((op) => op.op === 'createType' && op.key === 'khach-hang-vip')).toMatchObject({ basedOn: 'khach-hang' })
    expect(pack.operations.map((op) => op.op)).toEqual([
      'createType',
      'addField',
      'createType',
      'createType',
      'addField',
      'addField',
      'addField',
      'createGroup',
      'addField',
      'addLink'
    ])
    expect(pack.operations.every((op) => op.packKey === 'ban-hang')).toBe(true)
    expect(parsePackJson(JSON.stringify(pack))).toEqual({ kind: 'pack', pack })
  })

  it('installs the export into another workspace with the same setup', async () => {
    const from = await source()
    const pack = await exportPack(from, CHOSEN, META)
    const into = sessionFor(createWorkspace())
    await applyOps(into, pack.operations)
    expect(comparable(await describeConfig(into))).toBe(comparable(await describeConfig(from)))
    expect((await plan(into, pack.operations)).ops).toEqual([])
  })

  it('refuses what a pack cannot carry', async () => {
    const session = await source()
    const systemKey = systemKeyOf(await describeConfig(session))
    await expect(exportPack(session, [systemKey], META)).rejects.toMatchObject({ code: 'invalid' })
    await expect(exportPack(session, ['khach-hang-vip'], META)).rejects.toMatchObject({ code: 'invalid' })
    await expect(exportPack(session, ['khong-co'], META)).rejects.toMatchObject({ code: 'not-found' })
    await expect(exportPack(session, [], META)).rejects.toMatchObject({ code: 'invalid' })
    await expect(exportPack(session, CHOSEN, { ...META, key: 'Bán Hàng' })).rejects.toMatchObject({ code: 'invalid' })
    await applyOps(session, [{ op: 'archiveType', type: 'hop-dong' }])
    await expect(exportPack(session, ['hop-dong'], META)).rejects.toMatchObject({ code: 'invalid' })
  })
})
