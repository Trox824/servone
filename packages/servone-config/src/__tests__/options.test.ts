import type { CardSpace, MasterTag } from '@hcengineering/card'
import core, { type AnyAttribute, type Data, type Enum, generateId, type Ref } from '@hcengineering/core'
import { TypeEnum } from '@hcengineering/model'
import type { ConfigSession } from '../client'
import { describe as describeConfig } from '../describe'
import { toLabel } from '../keys'
import { plan } from '../plan'
import {
  addCard,
  addSpace,
  applyOps,
  attributeByKey,
  createWorkspace,
  type MemoryWorkspace,
  readCard,
  sessionFor,
  system,
  typeByKey
} from './harness'

interface Fixture {
  ws: MemoryWorkspace
  session: ConfigSession
  type: MasterTag
  space: Ref<CardSpace>
  single: AnyAttribute
  multi: AnyAttribute
}

async function fixture (): Promise<Fixture> {
  const ws = createWorkspace()
  const session = sessionFor(ws)
  const space = await addSpace(ws, 'Nhân sự')
  await applyOps(session, [
    { op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' },
    { op: 'addField', type: 'nghi-phep', key: 'loai', name: 'Loại', kind: { kind: 'select', options: ['A', 'B', 'C'] } },
    { op: 'addField', type: 'nghi-phep', key: 'nhan', name: 'Nhãn', kind: { kind: 'multiSelect', options: ['A', 'B', 'C'] } }
  ])
  const type = await typeByKey(ws, 'nghi-phep')
  return {
    ws,
    session,
    type,
    space,
    single: await attributeByKey(ws, type._id, 'loai'),
    multi: await attributeByKey(ws, type._id, 'nhan')
  }
}

async function optionsOf (session: ConfigSession, key: string): Promise<string[]> {
  const field = (await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')?.fields.find((it) => it.key === key)
  if (field === undefined) return []
  return field.kind.kind === 'select' || field.kind.kind === 'multiSelect' ? field.kind.options : []
}

describe('setOptions', () => {
  it('adds, renames and reorders; rename moves record values', async () => {
    const { ws, session, type, space, single } = await fixture()
    const record = await addCard(ws, type._id, space, { [single.name]: 'A' })
    const planned = await applyOps(session, [
      {
        op: 'setOptions',
        type: 'nghi-phep',
        field: 'loai',
        options: [{ add: 'D' }, { rename: 'A', to: 'A1' }, { reorder: ['D', 'A1', 'B', 'C'] }]
      }
    ])
    expect(planned.risk).toBe('safe')
    expect(planned.diff.map((it) => it.text)).toEqual([
      'Thêm lựa chọn *D* vào trường *Loại*',
      'Đổi lựa chọn *A* thành *A1* trong trường *Loại*',
      'Sắp xếp lại lựa chọn của trường *Loại*',
      'Cập nhật 1 hồ sơ theo lựa chọn mới của trường *Loại*'
    ])
    expect(await optionsOf(session, 'loai')).toEqual(['D', 'A1', 'B', 'C'])
    expect(Reflect.get(await readCard(ws, record), single.name)).toBe('A1')
  })

  it('requires mapTo to remove an option in use', async () => {
    const { ws, session, type, space, single } = await fixture()
    await addCard(ws, type._id, space, { [single.name]: 'B' })
    const planned = await plan(session, [{ op: 'setOptions', type: 'nghi-phep', field: 'loai', options: [{ remove: 'B' }] }])
    expect(planned.issues).toEqual([
      {
        opIndex: 0,
        code: 'bad-option',
        message: 'Lựa chọn *B* đang được dùng ở 1 hồ sơ; hãy chọn giá trị thay thế (mapTo)'
      }
    ])
  })

  it('removes an unused option without mapTo as safe', async () => {
    const { session } = await fixture()
    const planned = await applyOps(session, [{ op: 'setOptions', type: 'nghi-phep', field: 'loai', options: [{ remove: 'C' }] }])
    expect(planned.risk).toBe('safe')
    expect(await optionsOf(session, 'loai')).toEqual(['A', 'B'])
  })

  it('remaps records when removing with mapTo, as destructive', async () => {
    const { ws, session, type, space, single } = await fixture()
    const record = await addCard(ws, type._id, space, { [single.name]: 'B' })
    const planned = await applyOps(session, [
      { op: 'setOptions', type: 'nghi-phep', field: 'loai', options: [{ remove: 'B', mapTo: 'C' }] }
    ])
    expect(planned.risk).toBe('destructive')
    expect(planned.diff.find((it) => it.affected !== undefined)).toMatchObject({ affected: 1, risk: 'destructive' })
    expect(await optionsOf(session, 'loai')).toEqual(['A', 'C'])
    expect(Reflect.get(await readCard(ws, record), single.name)).toBe('C')
  })

  it('dedupes multi-select values on remap', async () => {
    const { ws, session, type, space, multi } = await fixture()
    const record = await addCard(ws, type._id, space, { [multi.name]: ['A', 'B'] })
    await applyOps(session, [{ op: 'setOptions', type: 'nghi-phep', field: 'nhan', options: [{ remove: 'B', mapTo: 'A' }] }])
    expect(Reflect.get(await readCard(ws, record), multi.name)).toEqual(['A'])
  })

  it('the inverse restores the option list and renamed values', async () => {
    const { ws, session, type, space, single } = await fixture()
    const record = await addCard(ws, type._id, space, { [single.name]: 'A' })
    const planned = await applyOps(session, [
      { op: 'setOptions', type: 'nghi-phep', field: 'loai', options: [{ rename: 'A', to: 'A1' }, { add: 'D', at: 0 }] }
    ])
    await applyOps(session, planned.inverse)
    expect(await optionsOf(session, 'loai')).toEqual(['A', 'B', 'C'])
    expect(Reflect.get(await readCard(ws, record), single.name)).toBe('A')
  })

  it('rejects remaps into a missing option and duplicate adds', async () => {
    const { session } = await fixture()
    const planned = await plan(session, [
      { op: 'setOptions', type: 'nghi-phep', field: 'loai', options: [{ remove: 'B', mapTo: 'Z' }] },
      { op: 'setOptions', type: 'nghi-phep', field: 'loai', options: [{ add: 'A' }] }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [0, 'bad-option'],
      [1, 'bad-option']
    ])
  })

  it('refuses a second option change on the same field in one plan', async () => {
    const { session } = await fixture()
    const planned = await plan(session, [
      { op: 'setOptions', type: 'nghi-phep', field: 'loai', options: [{ add: 'D' }] },
      { op: 'setOptions', type: 'nghi-phep', field: 'loai', options: [{ rename: 'D', to: 'E' }] },
      { op: 'setOptions', type: 'nghi-phep', field: 'nhan', options: [{ add: 'D' }] }
    ])
    expect(planned.issues).toEqual([
      { opIndex: 1, code: 'not-allowed', message: 'Gộp các thay đổi lựa chọn của một trường vào một thao tác' }
    ])
  })

  it('caps record updates across the whole plan, not per operation', async () => {
    const { ws, session, type, space, single, multi } = await fixture()
    const perField = 501
    for (let i = 0; i < perField; i++) await addCard(ws, type._id, space, { [single.name]: 'A', [multi.name]: ['A'] })
    const planned = await plan(session, [
      { op: 'setOptions', type: 'nghi-phep', field: 'loai', options: [{ remove: 'A', mapTo: 'B' }] },
      { op: 'setOptions', type: 'nghi-phep', field: 'nhan', options: [{ remove: 'A', mapTo: 'B' }] }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([[1, 'not-allowed']])
  })

  it('refuses non-dropdown fields and shared Enums', async () => {
    const { ws, session, type } = await fixture()
    await applyOps(session, [{ op: 'addField', type: 'nghi-phep', key: 'ly-do', name: 'Lý do', kind: { kind: 'text' } }])
    const shared = generateId<Enum>()
    const sharedOptions: Data<Enum> = { name: 'Dùng chung', enumValues: ['X'] }
    await ws.client.tx(system.createTxCreateDoc(core.class.Enum, core.space.Model, sharedOptions, shared))
    const legacy: Data<AnyAttribute> = {
      attributeOf: type._id,
      name: 'customLegacy',
      label: toLabel('Cũ'),
      isCustom: true,
      type: TypeEnum(shared)
    }
    await ws.client.tx(system.createTxCreateDoc(core.class.Attribute, core.space.Model, legacy))
    const planned = await plan(session, [
      { op: 'setOptions', type: 'nghi-phep', field: 'ly-do', options: [{ add: 'X' }] },
      { op: 'setOptions', type: 'nghi-phep', field: 'customLegacy', options: [{ add: 'Y' }] }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [0, 'not-allowed'],
      [1, 'unsupported']
    ])
  })
})
