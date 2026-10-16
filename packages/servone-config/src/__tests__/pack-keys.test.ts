import card from '@hcengineering/card'
import core from '@hcengineering/core'
import { applyChange, listChanges, saveDraft, undoChange } from '../changes'
import type { ConfigSession } from '../client'
import { describe as describeConfig } from '../describe'
import type { AddFieldOp, AddLinkOp, CreateGroupOp, CreateTypeOp, Operation } from '../operations'
import { type Pack, packStatus, parsePackJson } from '../pack'
import { plan } from '../plan'
import { readServone } from '../servone-fields'
import type { ChangeRecord } from '../types'
import { applyOps, attributeByKey, createWorkspace, type MemoryWorkspace, sessionFor, typeByKey } from './harness'

const LEAVE: CreateTypeOp = { op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép', packKey: 'de-nghi-noi-bo' }

describe('pack keys on record types', () => {
  it('writes the pack key and shows it in describe', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    await applyOps(session, [LEAVE])
    expect(readServone(await typeByKey(ws, 'nghi-phep')).servonePackKey).toBe('de-nghi-noi-bo')
    const type = (await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')
    expect(type?.packKey).toBe('de-nghi-noi-bo')
  })

  it('drops a type the same pack already installed', async () => {
    const session = sessionFor(createWorkspace())
    await applyOps(session, [LEAVE])
    const again = await plan(session, [LEAVE])
    expect(again).toMatchObject({ ops: [], txes: [], diff: [], inverse: [], issues: [], typeKeys: [] })
  })

  it('still refuses the key when the type is not from this pack', async () => {
    const byHand = sessionFor(createWorkspace())
    await applyOps(byHand, [{ op: 'createType', key: 'nghi-phep', name: 'Nghỉ phép' }])
    expect((await plan(byHand, [LEAVE])).issues.map((it) => it.code)).toEqual(['duplicate-key'])

    const otherPack = sessionFor(createWorkspace())
    // Different name so this case isolates the key clash: same name+key would also raise duplicate-name (see copy.test.ts).
    await applyOps(otherPack, [{ ...LEAVE, name: 'Tên khác', packKey: 'goi-khac' }])
    expect((await plan(otherPack, [LEAVE])).issues.map((it) => it.code)).toEqual(['duplicate-key'])
  })

  it('refuses to save a plan that skipped every operation', async () => {
    const session = sessionFor(createWorkspace())
    await applyOps(session, [LEAVE])
    const before = (await listChanges(session)).length
    await expect(saveDraft(session, await plan(session, [LEAVE]))).rejects.toMatchObject({
      code: 'invalid',
      message: 'Không có thay đổi nào để lưu'
    })
    expect(await listChanges(session)).toHaveLength(before)
  })

  it('keeps issue positions of the input list after a skipped op', async () => {
    const session = sessionFor(createWorkspace())
    await applyOps(session, [LEAVE])
    const planned = await plan(session, [LEAVE, { op: 'createType', key: 'Sai Khoa', name: 'Sai khóa' }])
    expect(planned.issues).toEqual([expect.objectContaining({ opIndex: 1, code: 'invalid-input' })])
    expect(planned.ops.map((it) => it.op)).toEqual(['createType'])
  })

  it('keeps the pack key through a saved draft', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await saveDraft(session, await plan(session, [LEAVE]))
    expect((await applyChange(session, draft.id)).kind).toBe('applied')
    expect(readServone(await typeByKey(ws, 'nghi-phep')).servonePackKey).toBe('de-nghi-noi-bo')
  })
})

const PACK = 'hop-dong-khach-hang'
const CUSTOMER: CreateTypeOp = { op: 'createType', key: 'khach-hang', name: 'Khách hàng', packKey: PACK }
const CONTRACT: CreateTypeOp = { op: 'createType', key: 'hop-dong', name: 'Hợp đồng', packKey: PACK }
const TAX_ID: AddFieldOp = { op: 'addField', type: 'khach-hang', key: 'ma-so-thue', name: 'Mã số thuế', kind: { kind: 'text' }, packKey: PACK }
const CUSTOMER_LINK: AddLinkOp = {
  op: 'addLink',
  key: 'khach-hang-hop-dong',
  from: 'khach-hang',
  to: 'hop-dong',
  fromName: 'Hợp đồng',
  toName: 'Khách hàng',
  fromMany: true,
  toMany: false,
  packKey: PACK
}
const BILLING: CreateGroupOp = { op: 'createGroup', key: 'xuat-hoa-don', name: 'Thông tin xuất hóa đơn', types: ['khach-hang'], packKey: PACK }
const BILLING_EMAIL: AddFieldOp = {
  op: 'addField',
  type: 'xuat-hoa-don',
  key: 'email-hoa-don',
  name: 'Email nhận hóa đơn',
  kind: { kind: 'text' },
  packKey: PACK
}
const CONTRACT_PACK: Operation[] = [CUSTOMER, CONTRACT, TAX_ID, CUSTOMER_LINK, BILLING, BILLING_EMAIL]

async function packKeyOfLink (ws: MemoryWorkspace, key: string): Promise<string | undefined> {
  const links = await ws.client.findAll(core.class.Association, {})
  const found = links.find((it) => readServone(it).servoneKey === key)
  return found !== undefined ? readServone(found).servonePackKey : undefined
}

async function packKeyOfGroup (ws: MemoryWorkspace, key: string): Promise<string | undefined> {
  const groups = await ws.client.findAll(card.class.Tag, {})
  const found = groups.find((it) => readServone(it).servoneKey === key)
  return found !== undefined ? readServone(found).servonePackKey : undefined
}

async function removeAndUndo (session: ConfigSession, removal: Operation): Promise<void> {
  const draft = await saveDraft(session, await plan(session, [removal]))
  expect((await applyChange(session, draft.id)).kind).toBe('applied')
  expect((await undoChange(session, draft.id)).kind).toBe('applied')
}

describe('pack keys on fields, links and field groups', () => {
  it('writes the pack key and shows it in describe', async () => {
    const session = sessionFor(createWorkspace())
    await applyOps(session, CONTRACT_PACK)
    const snapshot = await describeConfig(session)
    const customer = snapshot.types.find((it) => it.key === 'khach-hang')
    expect(customer?.fields.find((it) => it.key === 'ma-so-thue')?.packKey).toBe(PACK)
    expect(snapshot.links.find((it) => it.key === 'khach-hang-hop-dong')?.packKey).toBe(PACK)
    const group = snapshot.groups.find((it) => it.key === 'xuat-hoa-don')
    expect(group?.packKey).toBe(PACK)
    expect(group?.fields.find((it) => it.key === 'email-hoa-don')?.packKey).toBe(PACK)
  })

  it('re-plans the whole pack as zero operations', async () => {
    const session = sessionFor(createWorkspace())
    await applyOps(session, CONTRACT_PACK)
    expect(await plan(session, CONTRACT_PACK)).toMatchObject({ ops: [], txes: [], diff: [], issues: [] })
  })

  it('plans only the field that was removed', async () => {
    const session = sessionFor(createWorkspace())
    await applyOps(session, CONTRACT_PACK)
    await applyOps(session, [{ op: 'removeField', type: 'khach-hang', field: 'ma-so-thue' }])
    const again = await plan(session, CONTRACT_PACK)
    expect(again.issues).toEqual([])
    expect(again.ops).toEqual([TAX_ID])
  })

  it('refuses a field key the admin added by hand', async () => {
    const session = sessionFor(createWorkspace())
    await applyOps(session, [CUSTOMER])
    await applyOps(session, [{ op: 'addField', type: 'khach-hang', key: 'ma-so-thue', name: 'MST', kind: { kind: 'text' } }])
    expect((await plan(session, [TAX_ID])).issues.map((it) => it.code)).toEqual(['duplicate-key'])
  })

  it('keeps the pack key when a removal is undone', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    await applyOps(session, [CUSTOMER, CONTRACT, TAX_ID, CUSTOMER_LINK, BILLING])
    await removeAndUndo(session, { op: 'removeField', type: 'khach-hang', field: 'ma-so-thue' })
    await removeAndUndo(session, { op: 'removeLink', link: 'khach-hang-hop-dong' })
    await removeAndUndo(session, { op: 'removeGroup', group: 'xuat-hoa-don' })
    const customer = await typeByKey(ws, 'khach-hang')
    expect(readServone(await attributeByKey(ws, customer._id, 'ma-so-thue')).servonePackKey).toBe(PACK)
    expect(await packKeyOfLink(ws, 'khach-hang-hop-dong')).toBe(PACK)
    expect(await packKeyOfGroup(ws, 'xuat-hoa-don')).toBe(PACK)
  })

  it('does not hand the pack key to a copy', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    await applyOps(session, [CUSTOMER, CONTRACT, TAX_ID, CUSTOMER_LINK])
    await applyOps(session, [{ op: 'copyType', from: 'khach-hang', key: 'khach-hang-vip', name: 'Khách hàng VIP' }])
    const snapshot = await describeConfig(session)
    const copy = snapshot.types.find((it) => it.key === 'khach-hang-vip')
    expect(copy?.packKey).toBeUndefined()
    expect(copy?.fields.every((it) => it.packKey === undefined)).toBe(true)
    expect(snapshot.links.filter((it) => it.from === 'khach-hang-vip' || it.to === 'khach-hang-vip').every((it) => it.packKey === undefined)).toBe(true)
  })
})

function contractPack (): Pack {
  const parsed = parsePackJson(JSON.stringify({ key: PACK, version: 1, name: 'Hợp đồng', description: '', industry: '', operations: CONTRACT_PACK }))
  if (parsed.kind === 'invalid') throw new Error(parsed.issues.map((it) => it.message).join('; '))
  return parsed.pack
}

async function install (session: ConfigSession): Promise<ChangeRecord> {
  const draft = await saveDraft(session, await plan(session, CONTRACT_PACK))
  const applied = await applyChange(session, draft.id)
  expect(applied.kind).toBe('applied')
  return applied.change
}

describe('re-installing a pack after its install was undone', () => {
  it('restores the archived types and adds the rest again as one undoable change', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const pack = contractPack()
    const first = await install(session)
    expect(packStatus(pack, await describeConfig(session))).toBe('installed')

    expect((await undoChange(session, first.id, { isConfirmed: true })).kind).toBe('applied')
    expect(packStatus(pack, await describeConfig(session))).toBe('notInstalled')

    const again = await plan(session, CONTRACT_PACK)
    expect(again.issues).toEqual([])
    expect(again.ops).toEqual(CONTRACT_PACK)
    expect(again.diff.slice(0, 2).map((it) => it.text)).toEqual(['Khôi phục biểu mẫu *Khách hàng*', 'Khôi phục biểu mẫu *Hợp đồng*'])
    expect(again.inverse.slice(-2)).toEqual([
      { op: 'archiveType', type: 'hop-dong' },
      { op: 'archiveType', type: 'khach-hang' }
    ])
    const second = await install(session)
    expect(packStatus(pack, await describeConfig(session))).toBe('installed')

    expect((await undoChange(session, second.id, { isConfirmed: true })).kind).toBe('applied')
    expect(readServone(await typeByKey(ws, 'khach-hang')).servoneArchived).toBe(true)
    expect(readServone(await typeByKey(ws, 'hop-dong')).servoneArchived).toBe(true)
  })

  it('undoes only the real work of a plan that skips installed operations', async () => {
    const session = sessionFor(createWorkspace())
    await install(session)
    await applyOps(session, [{ op: 'removeField', type: 'khach-hang', field: 'ma-so-thue' }])
    const mixed = await plan(session, CONTRACT_PACK)
    expect(mixed.ops).toEqual([TAX_ID])
    expect(mixed.inverse).toEqual([{ op: 'removeField', type: 'khach-hang', field: 'ma-so-thue' }])
    const draft = await saveDraft(session, mixed)
    expect((await applyChange(session, draft.id)).kind).toBe('applied')
    expect((await undoChange(session, draft.id)).kind).toBe('applied')
    expect(packStatus(contractPack(), await describeConfig(session))).toBe('partial')
  })
})
