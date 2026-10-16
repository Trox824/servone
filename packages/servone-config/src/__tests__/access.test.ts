import card, { type CardSpace, type MasterTag, type Role } from '@hcengineering/card'
import core, { type Ref } from '@hcengineering/core'
import type { ConfigSession } from '../client'
import { describe as describeConfig } from '../describe'
import { CARD_PERMISSION_ADD_TAG, CARD_PERMISSION_REMOVE_TAG } from '../ids'
import { toAccountUuid, toRef } from '../keys'
import type { AccessPreset } from '../operations'
import { plan } from '../plan'
import { readServone } from '../servone-fields'
import { addSpace, applyOps, createWorkspace, type MemoryWorkspace, sessionFor, typeByKey } from './harness'

interface Fixture {
  ws: MemoryWorkspace
  session: ConfigSession
  type: MasterTag
  space: Ref<CardSpace>
}

const lan = toAccountUuid('lan-uuid')
const minh = toAccountUuid('minh-uuid')
const hoa = toAccountUuid('hoa-uuid')

async function fixture (): Promise<Fixture> {
  const ws = createWorkspace()
  const session = sessionFor(ws)
  const space = await addSpace(ws, 'Nhân sự')
  await applyOps(session, [{ op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' }])
  return { ws, session, type: await typeByKey(ws, 'nghi-phep'), space }
}

async function roleOf (ws: MemoryWorkspace, type: MasterTag, preset: AccessPreset): Promise<Role | undefined> {
  const roles = await ws.client.findAll(card.class.Role, {})
  return roles.find((it) => it.types.includes(type._id) && readServone(it).servonePreset === preset)
}

async function readSpace (ws: MemoryWorkspace, id: Ref<CardSpace>): Promise<CardSpace | undefined> {
  const [found] = await ws.client.findAll(card.class.CardSpace, { _id: id })
  return found
}

describe('setAccess', () => {
  it('creates preset roles with Huly permissions and assigns people per space', async () => {
    const { ws, session, type, space } = await fixture()
    const planned = await applyOps(session, [
      { op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space, viewer: [lan], editor: [minh], manager: [hoa] }] } }
    ])
    expect(planned.risk).toBe('sensitive')
    expect(planned.diff.map((it) => it.text)).toEqual([
      'Tạo vai trò *Người xem* cho *Đề nghị nghỉ phép*',
      'Tạo vai trò *Người nhập* cho *Đề nghị nghỉ phép*',
      'Tạo vai trò *Người quản lý* cho *Đề nghị nghỉ phép*',
      'Quyền với *Đề nghị nghỉ phép* trong *Nhân sự*: Người xem: 1 người, Người nhập: 1 người, Người quản lý: 1 người',
      '*Nhân sự* chỉ cho người được cấp quyền thao tác'
    ])

    expect((await roleOf(ws, type, 'viewer'))?.permissions).toEqual([])
    expect((await roleOf(ws, type, 'editor'))?.permissions).toEqual([`${type._id}_create_allowed`, `${type._id}_allowed`])
    expect((await roleOf(ws, type, 'manager'))?.permissions).toEqual([
      `${type._id}_create_allowed`,
      `${type._id}_allowed`,
      `${type._id}_remove_allowed`,
      CARD_PERMISSION_ADD_TAG,
      CARD_PERMISSION_REMOVE_TAG
    ])
    const [update] = await ws.client.findAll(core.class.ClassPermission, { _id: toRef(`${type._id}_allowed`) })
    expect(update).toMatchObject({
      objectClass: type._id,
      targetClass: type._id,
      txClass: core.class.TxUpdateDoc,
      txMatch: { objectClass: type._id },
      scope: 'space',
      forbid: false
    })

    const stored = await readSpace(ws, space)
    expect(stored?.restricted).toBe(true)
    expect(stored?.types).toContain(type._id)
    const [leaveType] = (await describeConfig(session)).types.filter((it) => it.key === 'nghi-phep')
    expect(leaveType.access).toEqual([{ space, viewer: [lan], editor: [minh], manager: [hoa] }])
  })

  it('reuses roles and permissions on a second change', async () => {
    const { ws, session, type, space } = await fixture()
    await applyOps(session, [{ op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space, editor: [minh] }] } }])
    const second = await applyOps(session, [{ op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space, editor: [minh, lan] }] } }])
    expect(second.diff.map((it) => it.text)).toEqual(['Quyền với *Đề nghị nghỉ phép* trong *Nhân sự*: Người nhập: 2 người'])
    const roles = (await ws.client.findAll(card.class.Role, {})).filter((it) => it.types.includes(type._id))
    expect(roles).toHaveLength(1)
    const [leaveType] = (await describeConfig(session)).types.filter((it) => it.key === 'nghi-phep')
    expect(leaveType.access).toEqual([{ space, viewer: [], editor: [minh, lan], manager: [] }])
  })

  it('the inverse restores people and the restriction flag', async () => {
    const { ws, session, space } = await fixture()
    const planned = await applyOps(session, [{ op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space, editor: [minh] }] } }])
    await applyOps(session, planned.inverse)
    expect((await readSpace(ws, space))?.restricted).toBe(false)
    const [leaveType] = (await describeConfig(session)).types.filter((it) => it.key === 'nghi-phep')
    expect(leaveType.access).toEqual([{ space, viewer: [], editor: [], manager: [] }])
  })

  it('refuses field groups, unknown spaces and empty space entries', async () => {
    const { session, space } = await fixture()
    await applyOps(session, [{ op: 'createGroup', key: 'phap-ly', name: 'Pháp lý', types: ['nghi-phep'] }])
    const planned = await plan(session, [
      { op: 'setAccess', type: 'phap-ly', access: { spaces: [{ space, editor: [minh] }] } },
      { op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space: 'Không có', editor: [minh] }] } },
      { op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space }] } }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [0, 'unsupported'],
      [1, 'not-found'],
      [2, 'invalid-input']
    ])
  })
})
