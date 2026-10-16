import type { CardSpace, MasterTag } from '@hcengineering/card'
import core, { type Ref } from '@hcengineering/core'
import type { ConfigSession } from '../client'
import { describe as describeConfig } from '../describe'
import { plan } from '../plan'
import { readServone } from '../servone-fields'
import {
  addCard,
  addSpace,
  applyOps,
  attributeByKey,
  createWorkspace,
  type MemoryWorkspace,
  readCard,
  sessionFor,
  typeByKey
} from './harness'

interface Fixture {
  ws: MemoryWorkspace
  session: ConfigSession
  type: MasterTag
  space: Ref<CardSpace>
}

async function leaveType (): Promise<Fixture> {
  const ws = createWorkspace()
  const session = sessionFor(ws)
  const space = await addSpace(ws, 'Nhân sự')
  await applyOps(session, [{ op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' }])
  return { ws, session, type: await typeByKey(ws, 'nghi-phep'), space }
}

describe('addField', () => {
  it('adds a dropdown whose Enum is owned by the field', async () => {
    const { ws, session, type } = await leaveType()
    const planned = await applyOps(session, [
      {
        op: 'addField',
        type: 'nghi-phep',
        key: 'loai-nghi',
        name: 'Loại nghỉ',
        kind: { kind: 'select', options: ['Phép năm', 'Ốm'] },
        required: true
      }
    ])
    expect(planned.diff.map((it) => it.text)).toEqual([
      'Thêm trường *Loại nghỉ* (Danh sách chọn: Phép năm, Ốm) vào *Đề nghị nghỉ phép*'
    ])
    expect(planned.inverse).toEqual([{ op: 'removeField', type: 'nghi-phep', field: 'loai-nghi' }])

    const field = (await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')?.fields[0]
    expect(field).toEqual({
      key: 'loai-nghi',
      name: 'Loại nghỉ',
      kind: { kind: 'select', options: ['Phép năm', 'Ốm'] },
      isRequired: true,
      isBuiltIn: false
    })
    const attribute = await attributeByKey(ws, type._id, 'loai-nghi')
    expect(attribute.name.startsWith('custom')).toBe(true)
    const [owned] = await ws.client.findAll(core.class.Enum, { name: 'Đề nghị nghỉ phép · Loại nghỉ' })
    expect(readServone(owned).servoneOwnerField).toBe(attribute._id)
  })

  it('stores the money format and creates an upper-case auto number sequence', async () => {
    const { ws, session, type } = await leaveType()
    await applyOps(session, [
      { op: 'addField', type: 'nghi-phep', key: 'tam-ung', name: 'Tạm ứng', kind: { kind: 'money', currency: 'VND' } },
      { op: 'addField', type: 'nghi-phep', key: 'ma', name: 'Mã', kind: { kind: 'autoNumber', prefix: 'np' } }
    ])
    const money = await attributeByKey(ws, type._id, 'tam-ung')
    expect(readServone(money).servoneFormat).toEqual({ kind: 'money', currency: 'VND' })
    const sequences = await ws.client.findAll(core.class.CustomSequence, { prefix: 'NP' })
    expect(sequences).toHaveLength(1)
    const fields = (await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')?.fields ?? []
    expect(fields.map((it) => it.kind)).toEqual([
      { kind: 'money', currency: 'VND' },
      { kind: 'autoNumber', prefix: 'NP' }
    ])

    const again = await plan(session, [
      { op: 'addField', type: 'nghi-phep', key: 'ma-2', name: 'Mã 2', kind: { kind: 'autoNumber', prefix: 'NP' } }
    ])
    expect(again.issues[0]).toMatchObject({ code: 'duplicate-key' })
  })

  it('upper-cases the currency code before checking it', async () => {
    const { ws, session, type } = await leaveType()
    await applyOps(session, [
      { op: 'addField', type: 'nghi-phep', key: 'tam-ung', name: 'Tạm ứng', kind: { kind: 'money', currency: 'vnd' } }
    ])
    expect(readServone(await attributeByKey(ws, type._id, 'tam-ung')).servoneFormat).toEqual({ kind: 'money', currency: 'VND' })
  })

  it('rejects duplicate names, empty options and bad currencies', async () => {
    const { session } = await leaveType()
    await applyOps(session, [{ op: 'addField', type: 'nghi-phep', key: 'ly-do', name: 'Lý do', kind: { kind: 'text' } }])
    const planned = await plan(session, [
      { op: 'addField', type: 'nghi-phep', key: 'ly-do-2', name: 'lý do', kind: { kind: 'text' } },
      { op: 'addField', type: 'nghi-phep', key: 'loai', name: 'Loại', kind: { kind: 'select', options: [] } },
      { op: 'addField', type: 'nghi-phep', key: 'tien', name: 'Tiền', kind: { kind: 'money', currency: 'dong' } }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [0, 'duplicate-name'],
      [1, 'bad-option'],
      [2, 'invalid-input']
    ])
  })
})

describe('built-in fields', () => {
  it('protects built-in fields of system types', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const snapshot = await describeConfig(session)
    const system = snapshot.types.find((it) => it.isSystem && it.fields.some((field) => field.isBuiltIn))
    if (system === undefined) throw new Error('models/all has no system type with a built-in field')
    const builtIn = system.fields.find((it) => it.isBuiltIn)
    if (builtIn === undefined) throw new Error('unreachable')

    const planned = await plan(session, [
      { op: 'removeField', type: system.key, field: builtIn.key },
      { op: 'updateField', type: system.key, field: builtIn.key, required: true },
      { op: 'updateField', type: system.key, field: builtIn.key, name: 'Tên mới' }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [0, 'system-protected'],
      [1, 'system-protected']
    ])
  })
})

describe('updateField', () => {
  it('renames and marks required; the inverse restores both', async () => {
    const { session } = await leaveType()
    await applyOps(session, [{ op: 'addField', type: 'nghi-phep', key: 'ly-do', name: 'Lý do', kind: { kind: 'text' } }])
    const planned = await applyOps(session, [
      { op: 'updateField', type: 'nghi-phep', field: 'ly-do', name: 'Lý do nghỉ', required: true }
    ])
    expect(planned.diff.map((it) => it.text)).toEqual([
      'Đổi tên trường *Lý do* thành *Lý do nghỉ* trong *Đề nghị nghỉ phép*',
      'Trường *Lý do* trong *Đề nghị nghỉ phép* thành bắt buộc'
    ])
    let field = (await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')?.fields[0]
    expect(field).toMatchObject({ key: 'ly-do', name: 'Lý do nghỉ', isRequired: true })
    await applyOps(session, planned.inverse)
    field = (await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')?.fields[0]
    expect(field).toMatchObject({ key: 'ly-do', name: 'Lý do', isRequired: false })
  })
})

describe('removeField', () => {
  it('is destructive when records hold values, and undo brings the values back', async () => {
    const { ws, session, type, space } = await leaveType()
    await applyOps(session, [{ op: 'addField', type: 'nghi-phep', key: 'ghi-chu', name: 'Ghi chú', kind: { kind: 'text' } }])
    const attribute = await attributeByKey(ws, type._id, 'ghi-chu')
    const record = await addCard(ws, type._id, space, { [attribute.name]: 'Về quê' })

    const planned = await applyOps(session, [{ op: 'removeField', type: 'nghi-phep', field: 'ghi-chu' }])
    expect(planned.risk).toBe('destructive')
    expect(planned.diff).toEqual([
      {
        text: 'Xóa trường *Ghi chú* khỏi *Đề nghị nghỉ phép*: 1 hồ sơ đang có giá trị ở trường này',
        risk: 'destructive',
        affected: 1
      }
    ])
    expect(planned.inverse).toEqual([
      {
        op: 'restoreField',
        type: 'nghi-phep',
        key: 'ghi-chu',
        name: 'Ghi chú',
        kind: { kind: 'text' },
        required: false,
        attributeId: attribute._id,
        attributeName: attribute.name
      }
    ])
    expect((await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')?.fields).toEqual([])

    await applyOps(session, planned.inverse)
    const restored = await attributeByKey(ws, type._id, 'ghi-chu')
    expect(restored._id).toBe(attribute._id)
    expect(Reflect.get(await readCard(ws, record), restored.name)).toBe('Về quê')
  })

  it('removes the owned Enum with its field and recreates it on restore', async () => {
    const { ws, session, type } = await leaveType()
    await applyOps(session, [
      { op: 'addField', type: 'nghi-phep', key: 'loai', name: 'Loại', kind: { kind: 'select', options: ['A', 'B'] } }
    ])
    const [owned] = await ws.client.findAll(core.class.Enum, { name: 'Đề nghị nghỉ phép · Loại' })
    const planned = await applyOps(session, [{ op: 'removeField', type: 'nghi-phep', field: 'loai' }])
    expect(planned.risk).toBe('safe')
    expect(planned.diff[0].text).toBe('Xóa trường *Loại* khỏi *Đề nghị nghỉ phép* (chưa có dữ liệu)')
    expect(await ws.client.findAll(core.class.Enum, { _id: owned._id })).toHaveLength(0)

    await applyOps(session, planned.inverse)
    const [recreated] = await ws.client.findAll(core.class.Enum, { _id: owned._id })
    expect(recreated.enumValues).toEqual(['A', 'B'])
    expect(readServone(recreated).servoneOwnerField).toBe((await attributeByKey(ws, type._id, 'loai'))._id)
  })

  it('refuses fields inherited from the parent type', async () => {
    const { session } = await leaveType()
    await applyOps(session, [
      { op: 'addField', type: 'nghi-phep', key: 'ly-do', name: 'Lý do', kind: { kind: 'text' } },
      { op: 'createType', key: 'nghi-om', name: 'Nghỉ ốm', basedOn: 'nghi-phep' }
    ])
    const planned = await plan(session, [{ op: 'removeField', type: 'nghi-om', field: 'ly-do' }])
    expect(planned.issues[0]).toMatchObject({ code: 'not-allowed' })
  })
})
