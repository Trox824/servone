import card from '@hcengineering/card'
import core, { type Association, type Data, type Relation } from '@hcengineering/core'
import type { ConfigSession } from '../client'
import { describe as describeConfig } from '../describe'
import { plan } from '../plan'
import { readServone } from '../servone-fields'
import { addCard, addSpace, applyOps, createWorkspace, type MemoryWorkspace, sessionFor, system, typeByKey } from './harness'

async function twoTypes (): Promise<{ ws: MemoryWorkspace, session: ConfigSession }> {
  const ws = createWorkspace()
  const session = sessionFor(ws)
  await applyOps(session, [
    { op: 'createType', key: 'hop-dong', name: 'Hợp đồng' },
    { op: 'createType', key: 'khach-hang', name: 'Khách hàng' }
  ])
  return { ws, session }
}

async function associationByKey (ws: MemoryWorkspace, key: string): Promise<Association | undefined> {
  const links = await ws.client.findAll(core.class.Association, {})
  return links.find((it) => readServone(it).servoneKey === key)
}

describe('links', () => {
  it.each([
    [false, false, '1:1', false],
    [true, false, '1:N', false],
    [false, true, '1:N', true],
    [true, true, 'N:N', false]
  ])('stores fromMany=%s toMany=%s as %s (flipped=%s)', async (fromMany, toMany, stored, isFlipped) => {
    const { ws, session } = await twoTypes()
    await applyOps(session, [
      { op: 'addLink', from: 'khach-hang', to: 'hop-dong', fromName: 'Hợp đồng', toName: 'Khách hàng', fromMany, toMany }
    ])
    const contract = await typeByKey(ws, 'hop-dong')
    const customer = await typeByKey(ws, 'khach-hang')
    const association = await associationByKey(ws, 'khach-hang-hop-dong')
    expect(association).toMatchObject({
      type: stored,
      classA: isFlipped ? contract._id : customer._id,
      classB: isFlipped ? customer._id : contract._id,
      nameB: isFlipped ? 'Khách hàng' : 'Hợp đồng'
    })
    const link = (await describeConfig(session)).links.find((it) => it.key === 'khach-hang-hop-dong')
    const isOneToMany = fromMany !== toMany
    expect(link).toEqual({
      key: 'khach-hang-hop-dong',
      from: isFlipped ? 'hop-dong' : 'khach-hang',
      to: isFlipped ? 'khach-hang' : 'hop-dong',
      fromName: isFlipped ? 'Khách hàng' : 'Hợp đồng',
      toName: isFlipped ? 'Hợp đồng' : 'Khách hàng',
      fromMany: isOneToMany || (fromMany && toMany),
      toMany: fromMany && toMany
    })
  })

  it('refuses a duplicate key and links to field groups', async () => {
    const { session } = await twoTypes()
    await applyOps(session, [
      { op: 'addLink', key: 'kh-hd', from: 'khach-hang', to: 'hop-dong', fromName: 'Hợp đồng', toName: 'Khách hàng', fromMany: true, toMany: false },
      { op: 'createGroup', key: 'phap-ly', name: 'Pháp lý', types: ['hop-dong'] }
    ])
    const planned = await plan(session, [
      { op: 'addLink', key: 'kh-hd', from: 'khach-hang', to: 'hop-dong', fromName: 'A', toName: 'B', fromMany: true, toMany: false },
      { op: 'addLink', from: 'khach-hang', to: 'phap-ly', fromName: 'A', toName: 'B', fromMany: true, toMany: false }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [0, 'duplicate-key'],
      [1, 'unsupported']
    ])
  })

  it('removes a link with connected records as destructive and restores it with the same id', async () => {
    const { ws, session } = await twoTypes()
    await applyOps(session, [
      { op: 'addLink', key: 'kh-hd', from: 'khach-hang', to: 'hop-dong', fromName: 'Hợp đồng', toName: 'Khách hàng', fromMany: true, toMany: false }
    ])
    const association = await associationByKey(ws, 'kh-hd')
    if (association === undefined) throw new Error('link was not created')
    const space = await addSpace(ws, 'Kinh doanh')
    const customer = await addCard(ws, (await typeByKey(ws, 'khach-hang'))._id, space)
    const contract = await addCard(ws, (await typeByKey(ws, 'hop-dong'))._id, space)
    const relation: Data<Relation> = { docA: customer, docB: contract, association: association._id }
    await ws.client.tx(system.createTxCreateDoc(core.class.Relation, core.space.Workspace, relation))

    const removed = await applyOps(session, [{ op: 'removeLink', link: 'kh-hd' }])
    expect(removed.risk).toBe('destructive')
    expect(removed.diff).toEqual([
      {
        text: 'Xóa liên kết *Khách hàng* - *Hợp đồng*: 1 cặp hồ sơ đang nối sẽ không còn hiện',
        risk: 'destructive',
        affected: 1
      }
    ])
    expect(await associationByKey(ws, 'kh-hd')).toBeUndefined()

    await applyOps(session, removed.inverse)
    expect((await associationByKey(ws, 'kh-hd'))?._id).toBe(association._id)
    expect(await ws.client.findAll(core.class.Relation, { association: association._id })).toHaveLength(1)
  })
})

describe('field groups', () => {
  it('creates a group on one type, takes fields and undoes cleanly', async () => {
    const { session } = await twoTypes()
    const planned = await applyOps(session, [
      { op: 'createGroup', key: 'phap-ly', name: 'Pháp lý', types: ['hop-dong'] },
      { op: 'addField', type: 'phap-ly', key: 'so-cong-chung', name: 'Số công chứng', kind: { kind: 'text' } }
    ])
    // models/mail ships a system Tag, so look the group up by key.
    const group = (await describeConfig(session)).groups.find((it) => it.key === 'phap-ly')
    expect(group).toMatchObject({ key: 'phap-ly', name: 'Pháp lý', type: 'hop-dong' })
    expect(group?.fields.map((it) => it.key)).toEqual(['so-cong-chung'])

    expect(planned.inverse.map((it) => it.op)).toEqual(['removeField', 'removeGroup'])
    await applyOps(session, planned.inverse)
    expect((await describeConfig(session)).groups.some((it) => it.key === 'phap-ly')).toBe(false)
  })

  it('does not attach one group to several types', async () => {
    const { session } = await twoTypes()
    const planned = await plan(session, [{ op: 'createGroup', key: 'chung', name: 'Chung', types: ['hop-dong', 'khach-hang'] }])
    expect(planned.issues).toEqual([
      { opIndex: 0, code: 'unsupported', message: 'Mỗi nhóm trường hiện chỉ gắn với một biểu mẫu' }
    ])
  })

  it('refuses to remove a group that still has fields', async () => {
    const { session } = await twoTypes()
    await applyOps(session, [
      { op: 'createGroup', key: 'phap-ly', name: 'Pháp lý', types: ['hop-dong'] },
      { op: 'addField', type: 'phap-ly', key: 'so', name: 'Số', kind: { kind: 'text' } }
    ])
    const planned = await plan(session, [{ op: 'removeGroup', group: 'phap-ly' }])
    expect(planned.issues.map((it) => it.code)).toEqual(['not-allowed'])
  })

  it('warns that undoing a used group does not reattach records, and names its type', async () => {
    const { ws, session } = await twoTypes()
    await applyOps(session, [{ op: 'createGroup', key: 'phap-ly', name: 'Pháp lý', types: ['hop-dong'] }])
    const contract = await typeByKey(ws, 'hop-dong')
    const groups = await ws.client.findAll(card.class.Tag, {})
    const legal = groups.find((it) => readServone(it).servoneKey === 'phap-ly')
    if (legal === undefined) throw new Error('No group phap-ly')
    const space = await addSpace(ws, 'Pháp chế')
    const record = await addCard(ws, contract._id, space)
    await ws.client.tx(system.createTxMixin(record, contract._id, space, legal._id, {}))
    const planned = await plan(session, [{ op: 'removeGroup', group: 'phap-ly' }])
    expect(planned.diff).toEqual([
      { text: 'Xóa nhóm trường *Pháp lý*: 1 hồ sơ đang gắn nhóm này', risk: 'destructive', affected: 1 },
      { text: 'Hoàn tác chỉ tạo lại nhóm trống, không gắn lại vào các hồ sơ', risk: 'destructive' }
    ])
    expect(planned.typeKeys).toEqual(['hop-dong'])
  })
})

describe('type keys of link removal', () => {
  it('names both linked types', async () => {
    const { session } = await twoTypes()
    await applyOps(session, [
      { op: 'addLink', key: 'kh-hd', from: 'khach-hang', to: 'hop-dong', fromName: 'Hợp đồng', toName: 'Khách hàng', fromMany: true, toMany: false }
    ])
    const planned = await plan(session, [{ op: 'removeLink', link: 'kh-hd' }])
    expect(planned.typeKeys).toEqual(['khach-hang', 'hop-dong'])
  })
})
