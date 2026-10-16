import card, { type CardSpace, type MasterTag } from '@hcengineering/card'
import core, {
  type AnyAttribute,
  type Association,
  ClassifierKind,
  type CustomSequence,
  type Data,
  type Enum,
  generateId,
  type Ref
} from '@hcengineering/core'
import { TypeEnum, TypeString } from '@hcengineering/model'
import { describe as describeConfig } from '../describe'
import { CHANGE_TYPE } from '../ids'
import { toLabel } from '../keys'
import { withServone } from '../servone-fields'
import { accountFor, addSpace, createWorkspace, type MemoryWorkspace, sessionFor, system } from './harness'

interface Seeded {
  contract: Ref<MasterTag>
  customer: Ref<MasterTag>
  space: Ref<CardSpace>
}

function typeDoc (name: string, key: string): Data<MasterTag> {
  const base: Data<MasterTag> = { extends: card.class.Card, label: toLabel(name), kind: ClassifierKind.CLASS, icon: card.icon.MasterTag }
  return withServone(base, { servoneKey: key })
}

async function seed (ws: MemoryWorkspace): Promise<Seeded> {
  const contract = generateId<MasterTag>()
  const customer = generateId<MasterTag>()
  await ws.client.tx(system.createTxCreateDoc(card.class.MasterTag, core.space.Model, typeDoc('Hợp đồng', 'hop-dong'), contract))
  await ws.client.tx(system.createTxCreateDoc(card.class.MasterTag, core.space.Model, typeDoc('Khách hàng', 'khach-hang'), customer))
  const statusEnum = generateId<Enum>()
  const status = generateId<AnyAttribute>()
  const options: Data<Enum> = { name: 'Hợp đồng · Trạng thái', enumValues: ['Nháp', 'Đã ký'] }
  await ws.client.tx(
    system.createTxCreateDoc(core.class.Enum, core.space.Model, withServone(options, { servoneOwnerField: status }), statusEnum)
  )
  const field: Data<AnyAttribute> = {
    attributeOf: contract,
    name: 'customStatus',
    label: toLabel('Trạng thái'),
    isCustom: true,
    type: TypeEnum(statusEnum)
  }
  await ws.client.tx(
    system.createTxCreateDoc(core.class.Attribute, core.space.Model, withServone(field, { servoneKey: 'trang-thai' }), status)
  )
  const link: Data<Association> = { classA: contract, classB: customer, nameA: 'Hợp đồng', nameB: 'Khách hàng', type: '1:N' }
  await ws.client.tx(
    system.createTxCreateDoc(core.class.Association, core.space.Model, withServone(link, { servoneKey: 'hop-dong-khach-hang' }))
  )
  const space = await addSpace(ws, 'Kinh doanh', [contract, customer])
  return { contract, customer, space }
}

describe('describe', () => {
  it('lists customer types, fields and links in concept terms', async () => {
    const ws = createWorkspace()
    const { space } = await seed(ws)
    const snapshot = await describeConfig(sessionFor(ws))
    const contract = snapshot.types.find((it) => it.key === 'hop-dong')
    expect(contract).toMatchObject({ name: 'Hợp đồng', isSystem: false, isArchived: false, spaces: [space], access: [] })
    expect(contract?.fields).toEqual([
      {
        key: 'trang-thai',
        name: 'Trạng thái',
        kind: { kind: 'select', options: ['Nháp', 'Đã ký'] },
        isRequired: false,
        isBuiltIn: false
      }
    ])
    expect(snapshot.links).toEqual([
      {
        key: 'hop-dong-khach-hang',
        from: 'hop-dong',
        to: 'khach-hang',
        fromName: 'Khách hàng',
        toName: 'Hợp đồng',
        fromMany: true,
        toMany: false
      }
    ])
    expect(snapshot.spaces).toEqual([{ id: space, name: 'Kinh doanh', isRestricted: false, isArchived: false }])
  })

  it('marks built-in types as system', async () => {
    const snapshot = await describeConfig(sessionFor(createWorkspace()))
    expect(snapshot.types.find((it) => it.key === card.types.File)).toMatchObject({ name: 'File', isSystem: true })
  })

  it('filters by type key and keeps links that touch it', async () => {
    const ws = createWorkspace()
    await seed(ws)
    const snapshot = await describeConfig(sessionFor(ws), { type: 'khach-hang' })
    expect(snapshot.types.map((it) => it.key)).toEqual(['khach-hang'])
    expect(snapshot.links.map((it) => it.key)).toEqual(['hop-dong-khach-hang'])
  })

  it('changes the version on config writes only', async () => {
    const ws = createWorkspace()
    const { contract, space } = await seed(ws)
    const session = sessionFor(ws)
    const before = (await describeConfig(session)).version

    await ws.client.tx(system.createTxUpdateDoc(card.class.CardSpace, core.space.Space, space, { members: [accountFor('hanh').uuid] }))
    const sequence: Data<CustomSequence> = { prefix: 'HD', sequence: 0, attachedTo: core.class.CustomSequence }
    await ws.client.tx(system.createTxCreateDoc(core.class.CustomSequence, core.space.Workspace, sequence))
    const changeType: Data<MasterTag> = { extends: card.class.Card, label: toLabel('Thay đổi cấu hình'), kind: ClassifierKind.CLASS }
    await ws.client.tx(system.createTxCreateDoc(card.class.MasterTag, core.space.Model, changeType, CHANGE_TYPE))
    expect((await describeConfig(session)).version).toBe(before)

    const note: Data<AnyAttribute> = { attributeOf: contract, name: 'customNote', label: toLabel('Ghi chú'), isCustom: true, type: TypeString() }
    await ws.client.tx(system.createTxCreateDoc(core.class.Attribute, core.space.Model, note))
    expect((await describeConfig(session)).version).not.toBe(before)
  })

  it('hides the change log type', async () => {
    const ws = createWorkspace()
    const changeType: Data<MasterTag> = { extends: card.class.Card, label: toLabel('Thay đổi cấu hình'), kind: ClassifierKind.CLASS }
    await ws.client.tx(system.createTxCreateDoc(card.class.MasterTag, core.space.Model, changeType, CHANGE_TYPE))
    const snapshot = await describeConfig(sessionFor(ws))
    expect(snapshot.types.some((it) => it.key === CHANGE_TYPE)).toBe(false)
  })
})
