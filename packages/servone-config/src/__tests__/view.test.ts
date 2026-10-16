import card, { type MasterTag } from '@hcengineering/card'
import type { Ref } from '@hcengineering/core'
import view, { type Viewlet, type ViewletDescriptor } from '@hcengineering/view'
import type { ConfigSession } from '../client'
import { NO_GROUPING } from '../ids'
import { plan } from '../plan'
import {
  addViewlets,
  applyOps,
  attributeByKey,
  createWorkspace,
  type MemoryWorkspace,
  sessionFor,
  typeByKey
} from './harness'

interface Fixture {
  ws: MemoryWorkspace
  session: ConfigSession
  type: MasterTag
}

async function fixture (): Promise<Fixture> {
  const ws = createWorkspace()
  const session = sessionFor(ws)
  await applyOps(session, [
    { op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' },
    { op: 'addField', type: 'nghi-phep', key: 'ly-do', name: 'Lý do', kind: { kind: 'text' } },
    { op: 'addField', type: 'nghi-phep', key: 'loai', name: 'Loại', kind: { kind: 'select', options: ['A', 'B'] } },
    { op: 'addField', type: 'nghi-phep', key: 'nguoi-duyet', name: 'Người duyệt', kind: { kind: 'person' } },
    { op: 'addField', type: 'nghi-phep', key: 'so-ngay', name: 'Số ngày', kind: { kind: 'number' } }
  ])
  await addViewlets(ws, 'nghi-phep')
  return { ws, session, type: await typeByKey(ws, 'nghi-phep') }
}

async function viewletOf (ws: MemoryWorkspace, attachTo: Ref<MasterTag>, descriptor: Ref<ViewletDescriptor>): Promise<Viewlet> {
  const found = (await ws.client.findAll(view.class.Viewlet, { attachTo, descriptor })).find((it) => it.variant === undefined)
  if (found === undefined) throw new Error(`No viewlet ${descriptor} on ${attachTo}`)
  return found
}

describe('setView', () => {
  it('sets field columns and keeps the stock non-field columns in front', async () => {
    const { ws, session, type } = await fixture()
    const planned = await applyOps(session, [{ op: 'setView', type: 'nghi-phep', view: { columns: ['loai', 'ly-do'] } }])
    expect(planned.diff.map((it) => it.text)).toEqual(['Cột bảng của *Đề nghị nghỉ phép*: Loại, Lý do'])
    const stock = await viewletOf(ws, card.class.Card, view.viewlet.Table)
    const table = await viewletOf(ws, type._id, view.viewlet.Table)
    const loai = await attributeByKey(ws, type._id, 'loai')
    const lyDo = await attributeByKey(ws, type._id, 'ly-do')
    expect(table.config).toEqual([...stock.config, loai.name, lyDo.name])
  })

  it('groups the list by a dropdown, a person, a stock grouping or nothing', async () => {
    const { ws, session, type } = await fixture()
    const loai = await attributeByKey(ws, type._id, 'loai')
    const approver = await attributeByKey(ws, type._id, 'nguoi-duyet')
    const cases: Array<[string | null, string]> = [
      ['loai', loai.name],
      ['nguoi-duyet', approver.name],
      ['createdBy', 'createdBy'],
      [null, NO_GROUPING]
    ]
    for (const [groupBy, stored] of cases) {
      await applyOps(session, [{ op: 'setView', type: 'nghi-phep', view: { groupBy } }])
      expect((await viewletOf(ws, type._id, view.viewlet.List)).viewOptions?.groupBy[0]).toBe(stored)
    }
  })

  it('refuses grouping by a text field and unknown columns', async () => {
    const { session } = await fixture()
    const planned = await plan(session, [
      { op: 'setView', type: 'nghi-phep', view: { groupBy: 'ly-do' } },
      { op: 'setView', type: 'nghi-phep', view: { columns: ['khong-co'] } }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [0, 'not-allowed'],
      [1, 'not-found']
    ])
  })

  it('the inverse restores columns and grouping', async () => {
    const { ws, session, type } = await fixture()
    const before = await viewletOf(ws, type._id, view.viewlet.Table)
    const planned = await applyOps(session, [{ op: 'setView', type: 'nghi-phep', view: { columns: ['so-ngay'], groupBy: 'loai' } }])
    await applyOps(session, planned.inverse)
    expect((await viewletOf(ws, type._id, view.viewlet.Table)).config).toEqual(before.config)
    expect((await viewletOf(ws, type._id, view.viewlet.List)).viewOptions?.groupBy[0]).toBe('_class')
  })

  it('refuses columns or grouping on a field added in the same plan', async () => {
    const { session } = await fixture()
    const planned = await plan(session, [
      { op: 'addField', type: 'nghi-phep', key: 'muc-do', name: 'Mức độ', kind: { kind: 'select', options: ['Cao', 'Thấp'] } },
      { op: 'setView', type: 'nghi-phep', view: { columns: ['ly-do', 'muc-do'] } },
      { op: 'setView', type: 'nghi-phep', view: { groupBy: 'muc-do' } },
      { op: 'setView', type: 'nghi-phep', view: { columns: ['ly-do'], groupBy: 'loai' } }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [1, 'not-allowed'],
      [2, 'not-allowed']
    ])
  })

  it('reports a type whose viewlets the server has not created yet', async () => {
    const ws = createWorkspace()
    const planned = await plan(sessionFor(ws), [
      { op: 'createType', key: 'moi', name: 'Mới' },
      { op: 'setView', type: 'moi', view: { groupBy: null } }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([[1, 'not-found']])
  })
})
