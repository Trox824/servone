import card, { type Card, type CardSpace, type MasterTag } from '@hcengineering/card'
import contact, { AvatarType, type Employee, type Person } from '@hcengineering/contact'
import core, {
  type Account,
  AccountRole,
  type AccountUuid,
  type AnyAttribute,
  buildModel,
  type Class,
  type Data,
  type Doc,
  type DocumentClassQuery,
  generateId,
  Hierarchy,
  type MarkupBlobRef,
  MeasureMetricsContext,
  ModelDb,
  type PersonId,
  type Ref,
  SortingOrder,
  type Tx,
  type TxApplyIf,
  type TxApplyResult,
  TxFactory,
  type TxResult
} from '@hcengineering/core'
import buildAllModel from '@hcengineering/model-all'
import process, { type Execution, type ExecutionContext, ExecutionStatus, type Process, type State, type Transition } from '@hcengineering/process'
import view, { type Viewlet } from '@hcengineering/view'
import type { ConfigClient, ConfigSession } from '../client'
import type { Operation } from '../operations'
import { plan } from '../plan'
import { sendTxes } from '../send'
import { readServone } from '../servone-fields'
import type { Plan } from '../types'

export interface MemoryWorkspace {
  client: ConfigClient
  model: ModelDb
  sent: Tx[]
}

export const system = new TxFactory(core.account.System)

let modelTxes: Tx[] | undefined

const isApplyIf = (tx: Tx): tx is TxApplyIf => tx._class === core.class.TxApplyIf

// Stands in for the transactor: no server triggers run and TxApplyIf is unpacked in order.
export function createWorkspace (): MemoryWorkspace {
  modelTxes ??= buildAllModel().getTxes()
  const hierarchy = new Hierarchy()
  const model = new ModelDb(hierarchy)
  // ModelDb updates docs in place, so each workspace gets its own copy of the model.
  buildModel(new MeasureMetricsContext('servone-config-test', {}), structuredClone(modelTxes), undefined, hierarchy, model)
  const sent: Tx[] = []
  async function matches (queries: DocumentClassQuery<Doc>[] | undefined): Promise<boolean> {
    if (queries === undefined) return true
    for (const { _class, query } of queries) {
      if ((await model.findAll(_class, query, { limit: 1 })).length === 0) return false
    }
    return true
  }
  async function write (tx: Tx): Promise<TxResult> {
    if (isApplyIf(tx)) {
      // Mirrors ApplyTxMiddleware.verifyApplyIf: a failed match rejects the whole apply, none of its txes run.
      if (!(await matches(tx.match))) {
        const rejected: TxApplyResult = { success: false, serverTime: 0 }
        return rejected
      }
      for (const inner of tx.txes) await write(inner)
      const applied: TxApplyResult = { success: true, serverTime: 0 }
      return applied
    }
    sent.push(tx)
    if (tx.objectSpace === core.space.Model) hierarchy.tx(tx)
    await model.tx(tx)
    return {}
  }
  return {
    client: {
      findAll: async (_class, query, options) => await model.findAll(_class, query, options),
      tx: write
    },
    model,
    sent
  }
}

export function accountFor (name: string, role: AccountRole = AccountRole.Maintainer): Account {
  const socialId = `${name}-social` as PersonId
  return { uuid: `${name}-uuid` as AccountUuid, role, primarySocialId: socialId, socialIds: [socialId], fullSocialIds: [] }
}

export function sessionFor (ws: MemoryWorkspace, name = 'admin', role: AccountRole = AccountRole.Maintainer): ConfigSession {
  return { client: ws.client, account: accountFor(name, role) }
}

export async function addSpace (ws: MemoryWorkspace, name: string, types: Array<Ref<MasterTag>> = []): Promise<Ref<CardSpace>> {
  const id = generateId<CardSpace>()
  const space: Data<CardSpace> = {
    name,
    description: '',
    private: false,
    members: [],
    archived: false,
    type: card.spaceType.SpaceType,
    types
  }
  await ws.client.tx(system.createTxCreateDoc(card.class.CardSpace, core.space.Space, space, id))
  return id
}

export async function addCard (
  ws: MemoryWorkspace,
  type: Ref<MasterTag>,
  space: Ref<CardSpace>,
  fields: Record<string, string | string[]> = {}
): Promise<Ref<Card>> {
  const id = generateId<Card>()
  const base: Data<Card> = { title: 'Hồ sơ', content: '' as MarkupBlobRef, blobs: {}, parentInfo: [], rank: '' }
  await ws.client.tx(system.createTxCreateDoc<Card>(type, space, Object.assign(base, fields), id))
  return id
}

export async function readCard (ws: MemoryWorkspace, id: Ref<Card>): Promise<Card> {
  const [found] = await ws.client.findAll(card.class.Card, { _id: id })
  if (found === undefined) throw new Error(`No card ${id}`)
  return found
}

export async function typeByKey (ws: MemoryWorkspace, key: string): Promise<MasterTag> {
  const types = await ws.client.findAll(card.class.MasterTag, {})
  const found = types.find((it) => readServone(it).servoneKey === key)
  if (found === undefined) throw new Error(`No type with key ${key}`)
  return found
}

export async function attributeByKey (ws: MemoryWorkspace, owner: Ref<Class<Doc>>, key: string): Promise<AnyAttribute> {
  const attributes = await ws.client.findAll(core.class.Attribute, { attributeOf: owner })
  const found = attributes.find((it) => readServone(it).servoneKey === key)
  if (found === undefined) throw new Error(`No field with key ${key}`)
  return found
}

// Mirrors server-plugins/card-resources OnMasterTagCreate (copy parent viewlets) and OnAttribute (append column).
export async function addViewlets (ws: MemoryWorkspace, key: string): Promise<void> {
  const type = await typeByKey(ws, key)
  const fields = await ws.client.findAll(core.class.Attribute, { attributeOf: type._id })
  const stock = await ws.client.findAll(view.class.Viewlet, { attachTo: card.class.Card })
  for (const viewlet of stock) {
    if (viewlet.variant !== undefined) continue
    const isTable = viewlet.descriptor === view.viewlet.Table
    const copy: Data<Viewlet> = {
      attachTo: type._id,
      descriptor: viewlet.descriptor,
      config: isTable ? [...viewlet.config, ...fields.map((it) => it.name)] : [...viewlet.config],
      viewOptions: viewlet.viewOptions !== undefined ? structuredClone(viewlet.viewOptions) : undefined,
      configOptions: viewlet.configOptions
    }
    await ws.client.tx(system.createTxCreateDoc(view.class.Viewlet, core.space.Model, copy))
  }
}

export async function applyOps (session: ConfigSession, ops: Operation[]): Promise<Plan> {
  const planned = await plan(session, ops)
  expect(planned.issues).toEqual([])
  await sendTxes(session, planned.txes)
  return planned
}

export interface TestEmployee {
  account: AccountUuid
  person: Ref<Employee>
}

export async function addEmployee (ws: MemoryWorkspace, name: string): Promise<TestEmployee> {
  const account = `${name.toLowerCase()}-uuid` as AccountUuid
  const person = generateId<Employee>()
  const base: Data<Person> = { name, avatarType: AvatarType.COLOR, personUuid: account }
  await ws.client.tx(system.createTxCreateDoc<Person>(contact.class.Person, contact.space.Contacts, base, person))
  await ws.client.tx(
    system.createTxMixin<Person, Employee>(person, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, {
      active: true
    })
  )
  return { account, person }
}

// Same fields ProcessesSection.svelte writes when an admin adds a process by hand.
export async function addProcess (
  ws: MemoryWorkspace,
  type: Ref<MasterTag>,
  name: string,
  description = ''
): Promise<Ref<Process>> {
  const id = generateId<Process>()
  const base: Data<Process> = { name, masterTag: type, context: {}, description }
  await ws.client.tx(system.createTxCreateDoc(process.class.Process, core.space.Model, base, id))
  return id
}

export async function addExecution (
  ws: MemoryWorkspace,
  rule: Ref<Process>,
  cardId: Ref<Card>,
  space: Ref<CardSpace>,
  state: Ref<State>
): Promise<Ref<Execution>> {
  const id = generateId<Execution>()
  // Same empty context the server's createExecution writes; the type is branded.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const context = {} as ExecutionContext
  const base: Data<Execution> = {
    process: rule,
    currentState: state,
    card: cardId,
    rollback: [],
    context,
    status: ExecutionStatus.Active
  }
  await ws.client.tx(system.createTxCreateDoc(process.class.Execution, space, base, id))
  return id
}

export interface RuleDocs {
  rule: Process
  states: State[]
  transitions: Transition[]
}

export async function ruleDocs (ws: MemoryWorkspace, type: Ref<MasterTag>, key: string): Promise<RuleDocs> {
  const rules = await ws.client.findAll(process.class.Process, { masterTag: type })
  const rule = rules.find((it) => readServone(it).servoneKey === key)
  if (rule === undefined) throw new Error(`No rule with key ${key}`)
  const states = await ws.client.findAll(process.class.State, { process: rule._id }, { sort: { rank: SortingOrder.Ascending } })
  const transitions = await ws.client.findAll(
    process.class.Transition,
    { process: rule._id },
    { sort: { rank: SortingOrder.Ascending } }
  )
  return { rule, states, transitions }
}
