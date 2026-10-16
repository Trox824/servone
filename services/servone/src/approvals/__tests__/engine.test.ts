import calendar, { type Event } from '@hcengineering/calendar'
import contact from '@hcengineering/contact'
import core, {
  AccountRole,
  type AccountUuid,
  type Class,
  type Doc,
  type DocumentQuery,
  type PersonId,
  type Ref,
  type Space,
  toFindResult,
  type Tx,
  type TxApplyIf,
  type TxCreateDoc,
  type TxCUD,
  TxFactory,
  type TxRemoveDoc,
  type TxUpdateDoc,
  type WorkspaceUuid
} from '@hcengineering/core'
import hr, { type Department, type Request as Leave, type Staff, type TzDate } from '@hcengineering/hr'
import request, { RequestStatus } from '@hcengineering/request'
import task, { type TaskType } from '@hcengineering/task'
import tracker, { type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import type { Json } from '../../http-json'
import { RESOURCE_CLASS } from '@servone/approvals'
import {
  type ApprovalClient,
  type ApprovalRequest,
  AUTO_APPROVED_REASON,
  decide as decideAs,
  expireBookings,
  EXPIRED_REASON,
  NO_APPROVER_REASON,
  onTx
} from '../engine'
import { createApprovalsHandler } from '../http'

const SALES = 'dept-sales'
const PROJECT = 'p-buy' as Ref<Project>
const PROJECT_TYPE = 'type-buy'
const TASK_TYPE = 'task-buy' as Ref<TaskType>
const [TODO, QUOTE, GATE, CANCELED, BOUGHT] = ['st-todo', 'st-quote', 'st-gate', 'st-canceled', 'st-bought'] as Array<Ref<IssueStatus>>
const ORDER = [TODO, QUOTE, GATE, CANCELED, BOUGHT]
const ISSUE = 'issue-1' as Ref<Issue>
const HEAD = 'hr:ids:Head'

// Stands in for the transactor: applies creates, plain updates and removes, and keeps every tx for history reads.
interface MemoryWorkspace {
  client: ApprovalClient
  rows: (cls: Ref<Class<Doc>>) => Doc[]
  send: (tx: Tx) => Promise<void>
  // Writes touching these classes fail, as when the transactor goes down mid-decision.
  unreachable: Set<Ref<Class<Doc>>>
  admins: AccountUuid[]
  seed: (cls: Ref<Class<Doc>>, id: string, fields: Record<string, Json>) => void
}

function memoryWorkspace (): MemoryWorkspace {
  const tables = new Map<Ref<Class<Doc>>, Doc[]>()
  const rows = (cls: Ref<Class<Doc>>): Doc[] => {
    const table = tables.get(cls) ?? []
    tables.set(cls, table)
    return table
  }
  const seed = (cls: Ref<Class<Doc>>, id: string, fields: Record<string, Json>): void => {
    rows(cls).push({ space: core.space.Workspace, modifiedOn: 0, modifiedBy: core.account.System, ...fields, _id: id as Ref<Doc>, _class: cls })
  }
  seed(hr.class.Department, HEAD, { name: 'Công ty', teamLead: 'emp-boss', managers: [], members: [] })
  seed(hr.class.Department, SALES, { name: 'Kinh doanh', parent: HEAD, teamLead: 'emp-head', managers: [], members: ['emp-an'] })
  for (const name of ['an', 'head', 'boss', 'binh']) {
    seed(contact.mixin.Employee, `emp-${name}`, { active: true, personUuid: `acc-${name}`, [hr.mixin.Staff]: { department: SALES } })
    seed(contact.class.SocialIdentity, `soc-${name}`, { attachedTo: `emp-${name}` })
  }

  seed(tracker.class.Project, PROJECT, { private: true, members: ['acc-an'], type: PROJECT_TYPE })
  seed(task.class.ProjectType, PROJECT_TYPE, { statuses: ORDER.map((status): Json => (status === GATE ? { _id: status, servoneApproval: { by: 'manager' } } : { _id: status })) })
  seed(task.class.TaskType, TASK_TYPE, { parent: PROJECT_TYPE, statuses: ORDER })
  for (const status of ORDER) seed(core.class.Status, status, { category: status === CANCELED ? task.statusCategory.Lost : task.statusCategory.Active })

  const matches = (row: Doc, query: DocumentQuery<Doc>): boolean =>
    Object.entries(query).every(([key, cond]) => {
      const field = Reflect.get(row, key)
      if (cond !== null && typeof cond === 'object' && '$in' in cond) return cond.$in.includes(field)
      if (cond !== null && typeof cond === 'object' && '$lte' in cond) return field <= cond.$lte
      return field === cond
    })
  // The transactor answers a base class query with its subclasses' docs too.
  const subclasses = new Map<Ref<Class<Doc>>, Array<Ref<Class<Doc>>>>([
    [task.class.Task, [tracker.class.Issue]],
    [core.class.Space, [tracker.class.Project]],
    [calendar.class.Event, [calendar.class.ReccuringEvent, calendar.class.ReccuringInstance]]
  ])
  const find = <T extends Doc>(cls: Ref<Class<T>>, query: DocumentQuery<T>): T[] =>
    [cls, ...(subclasses.get(cls) ?? [])].flatMap((it) => rows(it)).filter((row) => matches(row, query)) as T[]
  const unreachable = new Set<Ref<Class<Doc>>>()
  const admins: AccountUuid[] = []
  const touches = (tx: Tx): Array<Ref<Class<Doc>>> =>
    tx._class === core.class.TxApplyIf ? (tx as TxApplyIf).txes.flatMap(touches) : [(tx as TxCUD<Doc>).objectClass]
  const apply = async (tx: Tx): Promise<void> => {
    if (tx._class === core.class.TxApplyIf) {
      for (const inner of (tx as TxApplyIf).txes) await apply(inner)
      return
    }
    rows(core.class.TxCUD).push(tx)
    if (tx._class === core.class.TxCreateDoc) {
      const create = tx as TxCreateDoc<Doc>
      rows(create.objectClass).push({
        ...create.attributes,
        _id: create.objectId,
        _class: create.objectClass,
        space: create.objectSpace,
        modifiedOn: create.modifiedOn,
        modifiedBy: create.modifiedBy,
        createdBy: create.modifiedBy
      })
    }
    if (tx._class === core.class.TxUpdateDoc) {
      const update = tx as TxUpdateDoc<Doc>
      const row = rows(update.objectClass).find((it) => it._id === update.objectId)
      if (row === undefined) throw new Error(`update of missing ${update.objectId}`)
      const { $unset, ...operations } = update.operations
      Object.assign(row, operations, { modifiedBy: update.modifiedBy })
      for (const key of Object.keys($unset ?? {})) Reflect.deleteProperty(row, key)
    }
    if (tx._class === core.class.TxRemoveDoc) {
      const remove = tx as TxRemoveDoc<Doc>
      const table = rows(remove.objectClass)
      table.splice(table.findIndex((it) => it._id === remove.objectId), 1)
    }
  }
  const client: ApprovalClient = {
    workspaceAdmins: async () => admins,
    findAll: async (cls, query) => toFindResult(find(cls, query)),
    findOne: async (cls, query) => find(cls, query)[0],
    tx: async (tx) => {
      if (touches(tx).some((cls) => unreachable.has(cls))) throw new Error('transactor unreachable')
      if (tx._class !== core.class.TxApplyIf) {
        await apply(tx)
        return {}
      }
      const { match } = tx as TxApplyIf
      const isMatched = (match ?? []).every(({ _class, query }) => find(_class, query).length > 0)
      if (isMatched) await apply(tx)
      return { success: isMatched, serverTime: 0 }
    }
  }
  // A user's write: the transactor applies it, then the queue delivers it to the engine.
  const send = async (tx: Tx): Promise<void> => {
    await apply(tx)
    await onTx(client, tx)
  }
  return { client, rows, send, unreachable, admins, seed }
}

const LEAVE = 'leave-1' as Ref<Leave>
const userTx = (social: string): TxFactory => new TxFactory(social as PersonId)

const DAY: TzDate = { year: 2026, month: 9, day: 5, offset: 0 }

function newLeave (person: string): TxCreateDoc<Leave> {
  return userTx(`soc-${person}`).createTxCreateDoc(
    hr.class.Request,
    SALES as Ref<Space>,
    {
      attachedTo: `emp-${person}` as Ref<Staff>,
      attachedToClass: hr.mixin.Staff,
      collection: 'requests',
      department: SALES as Ref<Department>,
      type: hr.ids.Vacation,
      description: '',
      tzDate: DAY,
      tzDueDate: DAY
    },
    LEAVE
  )
}

// POSTs a decision as the employee `person`, through the real handler, against the in-memory workspace.
async function decide (client: ApprovalClient, person: string, path: string, body: Json = {}): Promise<{ status: number, body: Json }> {
  const handler = createApprovalsHandler({
    frontUrl: 'https://platform.servone.app',
    authenticate: async () => ({ account: `acc-${person}` as AccountUuid, workspace: 'ws-1' as WorkspaceUuid, role: AccountRole.Owner }),
    client: async () => client
  })
  const server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/approvals/${path}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
      body: JSON.stringify(body)
    })
    return { status: response.status, body: await response.json() }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

async function submittedLeave (): Promise<{ ws: MemoryWorkspace, id: string }> {
  const ws = memoryWorkspace()
  await ws.send(newLeave('an'))
  return { ws, id: ws.rows(request.class.Request)[0]._id }
}

// Only the fields the engine reads; the transactor would fill the rest.
function newIssue (person: string, status: Ref<IssueStatus>): TxCreateDoc<Doc> {
  return userTx(`soc-${person}`).createTxCreateDoc<Doc>(tracker.class.Issue, PROJECT, { kind: TASK_TYPE, status }, ISSUE)
}

function moveIssue (person: string, status: Ref<IssueStatus>): TxUpdateDoc<Issue> {
  return userTx(`soc-${person}`).createTxUpdateDoc(tracker.class.Issue, PROJECT, ISSUE, { status })
}

async function issueAtGate (): Promise<{ ws: MemoryWorkspace, id: string }> {
  const ws = memoryWorkspace()
  await ws.send(newIssue('an', TODO))
  await ws.send(moveIssue('an', QUOTE))
  await ws.send(moveIssue('an', TODO))
  await ws.send(moveIssue('an', GATE))
  return { ws, id: ws.rows(request.class.Request)[0]._id }
}

const statusOf = (ws: MemoryWorkspace): Ref<IssueStatus> | undefined => Reflect.get(ws.rows(tracker.class.Issue)[0], 'status')

describe('approval engine', () => {
  it('sends a new leave to the manager as one Active request, marked pending, once per redelivery', async () => {
    const ws = memoryWorkspace()
    const create = newLeave('an')
    await ws.send(create)
    await onTx(ws.client, create)

    expect(ws.rows(request.class.Request)).toMatchObject([
      { attachedTo: LEAVE, requested: ['emp-head'], status: RequestStatus.Active, servoneAction: 'hr.leave', modifiedBy: 'soc-an' }
    ])
    expect(ws.rows(hr.class.Request)[0]).toMatchObject({ servoneApproval: 'pending' })
  })

  it('completes the request and approves the leave when the approver approves', async () => {
    const { ws, id } = await submittedLeave()
    expect(await decide(ws.client, 'head', `${id}/approve`)).toEqual({ status: 200, body: { isOk: true } })
    expect(ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Completed, approved: ['emp-head'], modifiedBy: 'soc-head' })
    expect(ws.rows(hr.class.Request)[0]).toMatchObject({ servoneApproval: 'approved' })
  })

  it('refuses approval from anyone but the approver, and from the submitter even as approver of record', async () => {
    const { ws, id } = await submittedLeave()
    expect(await decide(ws.client, 'binh', `${id}/approve`)).toEqual({ status: 403, body: { error: 'not_approver' } })
    Object.assign(ws.rows(request.class.Request)[0], { requested: ['emp-an'] })
    expect(await decide(ws.client, 'an', `${id}/approve`)).toEqual({ status: 403, body: { error: 'not_approver' } })
    expect(ws.rows(hr.class.Request)[0]).toMatchObject({ servoneApproval: 'pending' })
  })

  it('refuses a reject reason under 10 characters and records a longer one', async () => {
    const { ws, id } = await submittedLeave()
    expect(await decide(ws.client, 'head', `${id}/reject`, { reason: '  123456789  ' })).toEqual({ status: 400, body: { error: 'reason_too_short' } })
    expect(await decide(ws.client, 'head', `${id}/reject`, { reason: 'Trùng lịch họp' })).toEqual({ status: 200, body: { isOk: true } })
    expect(ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Rejected, rejected: 'emp-head', servoneReason: 'Trùng lịch họp' })
    expect(ws.rows(hr.class.Request)[0]).toMatchObject({ servoneApproval: 'rejected' })
  })

  it('lets only the submitter withdraw', async () => {
    const { ws, id } = await submittedLeave()
    expect(await decide(ws.client, 'head', `${id}/withdraw`)).toEqual({ status: 403, body: { error: 'not_submitter' } })
    expect(await decide(ws.client, 'an', `${id}/withdraw`)).toEqual({ status: 200, body: { isOk: true } })
    expect(ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Cancelled })
    expect(ws.rows(hr.class.Request)[0]).toMatchObject({ servoneApproval: 'withdrawn' })
  })

  it('answers 409 to a second decision and 404 to an unknown request', async () => {
    const { ws, id } = await submittedLeave()
    await decide(ws.client, 'head', `${id}/approve`)
    expect(await decide(ws.client, 'head', `${id}/reject`, { reason: 'Đổi ý rồi, xin lỗi' })).toEqual({ status: 409, body: { error: 'not_active' } })
    expect(await decide(ws.client, 'head', 'req-gone/approve')).toEqual({ status: 404, body: { error: 'not_found' } })
  })

  it('sends an issue entering a gate to the mover\'s manager and adds them to the private project', async () => {
    const { ws } = await issueAtGate()
    expect(ws.rows(request.class.Request)).toMatchObject([
      { attachedTo: ISSUE, requested: ['emp-head'], status: RequestStatus.Active, servoneAction: 'task.status', servoneGate: GATE, modifiedBy: 'soc-an' }
    ])
    expect(ws.rows(tracker.class.Project)[0]).toMatchObject({ members: ['acc-an', 'acc-head'] })
  })

  it('moves an approved issue to the next status that is not Canceled', async () => {
    const { ws, id } = await issueAtGate()
    await decide(ws.client, 'head', `${id}/approve`)
    expect(statusOf(ws)).toBe(BOUGHT)
  })

  it('returns a rejected or withdrawn issue to the status it held before the gate', async () => {
    const rejected = await issueAtGate()
    await decide(rejected.ws.client, 'head', `${rejected.id}/reject`, { reason: 'Thiếu báo giá thứ hai' })
    expect(statusOf(rejected.ws)).toBe(TODO)

    const withdrawn = await issueAtGate()
    await decide(withdrawn.ws.client, 'an', `${withdrawn.id}/withdraw`)
    expect(statusOf(withdrawn.ws)).toBe(TODO)
  })

  it('closes the Active request as Cancelled when the item is canceled or deleted', async () => {
    const canceled = await issueAtGate()
    await canceled.ws.send(moveIssue('an', CANCELED))
    expect(canceled.ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Cancelled })

    const deleted = await issueAtGate()
    await deleted.ws.send(userTx('soc-an').createTxRemoveDoc(tracker.class.Issue, PROJECT, ISSUE))
    expect(deleted.ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Cancelled })

    const { ws } = await submittedLeave()
    await ws.send(userTx('soc-an').createTxRemoveDoc(hr.class.Request, SALES as Ref<Space>, LEAVE))
    expect(ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Cancelled })
  })

  it('rejects at once with "No approver found" and returns the item when nobody is above the submitter', async () => {
    const ws = memoryWorkspace()
    const boss = ws.rows(contact.mixin.Employee).find((row) => row._id === 'emp-boss')
    if (boss === undefined) throw new Error('no boss')
    Object.assign(boss, { [hr.mixin.Staff]: { department: HEAD } })
    await ws.send(newIssue('boss', TODO))
    await ws.send(moveIssue('boss', GATE))
    expect(ws.rows(request.class.Request)).toMatchObject([
      { requested: [], status: RequestStatus.Rejected, servoneReason: NO_APPROVER_REASON, modifiedBy: 'soc-boss' }
    ])
    expect(statusOf(ws)).toBe(TODO)
  })

  it('approves at once the leave of the top of the chart, saying why', async () => {
    const ws = memoryWorkspace()
    const boss = ws.rows(contact.mixin.Employee).find((row) => row._id === 'emp-boss')
    if (boss === undefined) throw new Error('no boss')
    Object.assign(boss, { [hr.mixin.Staff]: { department: HEAD } })
    await ws.send(newLeave('boss'))
    expect(ws.rows(request.class.Request)).toMatchObject([
      { attachedTo: LEAVE, requested: [], status: RequestStatus.Completed, servoneReason: AUTO_APPROVED_REASON, modifiedBy: 'soc-boss' }
    ])
    expect(ws.rows(hr.class.Request)[0]).toMatchObject({ servoneApproval: 'approved' })
  })

  it('still rejects a leave with nobody above when the chart has no head at all', async () => {
    const ws = memoryWorkspace()
    for (const dept of ws.rows(hr.class.Department)) Object.assign(dept, { teamLead: null })
    await ws.send(newLeave('an'))
    expect(ws.rows(request.class.Request)).toMatchObject([{ requested: [], status: RequestStatus.Rejected, servoneReason: NO_APPROVER_REASON }])
    expect(ws.rows(hr.class.Request)[0]).toMatchObject({ servoneApproval: 'rejected' })
  })

  // Day-precise TzDates around today would make the test depend on the clock, so the leave spans decades.
  const seedAwayNow = (ws: MemoryWorkspace, person: string): void => {
    ws.seed(hr.class.Request, `away-${person}`, {
      attachedTo: `emp-${person}`,
      servoneApproval: 'approved',
      tzDate: { year: 2000, month: 0, day: 1, offset: 0 },
      tzDueDate: { year: 2100, month: 0, day: 1, offset: 0 }
    })
  }
  const staffOf = (ws: MemoryWorkspace, person: string): Record<string, string> => {
    const employee = ws.rows(contact.mixin.Employee).find((row) => row._id === `emp-${person}`)
    if (employee === undefined) throw new Error(`no ${person}`)
    return Reflect.get(employee, hr.mixin.Staff)
  }

  it('sends a leave to the stand-in of a head on leave, recording why', async () => {
    const ws = memoryWorkspace()
    seedAwayNow(ws, 'head')
    Object.assign(staffOf(ws, 'head'), { servoneStandIn: 'emp-binh' })
    await ws.send(newLeave('an'))
    expect(ws.rows(request.class.Request)).toMatchObject([
      { requested: ['emp-binh'], status: RequestStatus.Active, servoneRoute: 'stand_in_leave', servoneRouteFor: 'emp-head' }
    ])
  })

  it('sends a leave from a team with no head to the parent team\'s head, recording why', async () => {
    const ws = memoryWorkspace()
    ws.seed(hr.class.Department, 'dept-retail', { name: 'Bán lẻ', parent: SALES, teamLead: null, managers: [], members: [] })
    Object.assign(staffOf(ws, 'an'), { department: 'dept-retail' })
    await ws.send(newLeave('an'))
    expect(ws.rows(request.class.Request)).toMatchObject([
      { requested: ['emp-head'], status: RequestStatus.Active, servoneRoute: 'no_head', servoneRouteFor: 'dept-retail' }
    ])
  })

  it('sends a leave to an admin instead of rejecting it when the chart has no head at all', async () => {
    const ws = memoryWorkspace()
    for (const dept of ws.rows(hr.class.Department)) Object.assign(dept, { teamLead: null })
    ws.admins.push('acc-boss' as AccountUuid)
    await ws.send(newLeave('an'))
    expect(ws.rows(request.class.Request)).toMatchObject([{ requested: ['emp-boss'], status: RequestStatus.Active, servoneRoute: 'admin' }])
    expect(ws.rows(hr.class.Request)[0]).toMatchObject({ servoneApproval: 'pending' })
  })

  const setGates = (ws: MemoryWorkspace, rules: Partial<Record<Ref<IssueStatus>, Json>>): void => {
    const statuses = ORDER.map((status): Json => (rules[status] === undefined ? { _id: status } : { _id: status, servoneApproval: rules[status] }))
    Object.assign(ws.rows(task.class.ProjectType)[0], { statuses })
  }
  const byAssignee = { by: 'field', attribute: 'assignee' }

  async function issueAtAssigneeGate (assignee: string | null): Promise<MemoryWorkspace> {
    const ws = memoryWorkspace()
    setGates(ws, { [GATE]: byAssignee })
    await ws.send(newIssue('an', TODO))
    Object.assign(ws.rows(tracker.class.Issue)[0], { assignee })
    await ws.send(moveIssue('an', GATE))
    return ws
  }

  it('sends an issue entering an Assignee gate to the assignee', async () => {
    const ws = await issueAtAssigneeGate('emp-binh')
    expect(ws.rows(request.class.Request)).toMatchObject([{ requested: ['emp-binh'], status: RequestStatus.Active }])
  })

  it('sends an Assignee gate with no, a departed or a self assignee to an admin', async () => {
    for (const assignee of [null, 'emp-gone', 'emp-an']) {
      const ws = memoryWorkspace()
      ws.admins.push('acc-boss' as AccountUuid)
      setGates(ws, { [GATE]: byAssignee })
      await ws.send(newIssue('an', TODO))
      Object.assign(ws.rows(tracker.class.Issue)[0], { assignee })
      await ws.send(moveIssue('an', GATE))
      expect(ws.rows(request.class.Request)).toMatchObject([{ requested: ['emp-boss'], status: RequestStatus.Active, servoneRoute: 'admin' }])
    }
  })

  it('sets the next Assignee gate\'s person in the same move as the approve, so that gate routes to them', async () => {
    const ws = await issueAtAssigneeGate('emp-head')
    setGates(ws, { [GATE]: byAssignee, [BOUGHT]: byAssignee })
    const id = ws.rows(request.class.Request)[0]._id
    expect(await decide(ws.client, 'head', `${id}/approve`, { next: 'emp-binh' })).toEqual({ status: 200, body: { isOk: true } })
    expect(ws.rows(tracker.class.Issue)[0]).toMatchObject({ status: BOUGHT, assignee: 'emp-binh' })

    const issueTxes = ws.rows(core.class.TxCUD).filter((tx) => (tx as TxCUD<Doc>).objectId === ISSUE)
    const move = issueTxes[issueTxes.length - 1]
    if (move === undefined) throw new Error('no move')
    expect((move as TxUpdateDoc<Issue>).operations).toEqual({ status: BOUGHT, assignee: 'emp-binh' })
    await onTx(ws.client, move as Tx)
    expect(ws.rows(request.class.Request)[1]).toMatchObject({ requested: ['emp-binh'], servoneGate: BOUGHT, modifiedBy: 'soc-head' })
  })

  it('refuses a next person when the next step is no Assignee gate, or the person is the approver or inactive', async () => {
    const plain = await issueAtAssigneeGate('emp-head')
    const plainId = plain.rows(request.class.Request)[0]._id
    expect(await decide(plain.client, 'head', `${plainId}/approve`, { next: 'emp-binh' })).toEqual({ status: 400, body: { error: 'bad_next' } })

    const ws = await issueAtAssigneeGate('emp-head')
    setGates(ws, { [GATE]: byAssignee, [BOUGHT]: byAssignee })
    const id = ws.rows(request.class.Request)[0]._id
    expect(await decide(ws.client, 'head', `${id}/approve`, { next: 'emp-head' })).toEqual({ status: 400, body: { error: 'bad_next' } })
    expect(await decide(ws.client, 'head', `${id}/approve`, { next: 'emp-gone' })).toEqual({ status: 400, body: { error: 'bad_next' } })
    expect(statusOf(ws)).toBe(GATE)
  })

  it('keeps the request Active when the action write fails, so a retry succeeds', async () => {
    const { ws, id } = await submittedLeave()
    ws.unreachable.add(hr.class.Request)
    await expect(decideAs(ws.client, 'acc-head' as AccountUuid, id as Ref<ApprovalRequest>, 'approve', '')).rejects.toThrow('transactor unreachable')
    expect(ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Active })

    ws.unreachable.clear()
    expect(await decide(ws.client, 'head', `${id}/approve`)).toEqual({ status: 200, body: { isOk: true } })
    expect(ws.rows(hr.class.Request)[0]).toMatchObject({ servoneApproval: 'approved' })
  })

  it('files each request step under the item with only its status, so the item\'s activity gets one line per step', async () => {
    const steps = async (ws: MemoryWorkspace): Promise<Array<TxCUD<Doc>>> =>
      (ws.rows(core.class.TxCUD) as Array<TxCUD<Doc>>).filter((tx) => tx.objectClass === request.class.Request && tx.attachedTo !== undefined)
    const expectFiled = (tx: TxCUD<Doc>): void => {
      expect(tx).toMatchObject({ attachedTo: ISSUE, attachedToClass: tracker.class.Issue, collection: 'requests' })
      if (tx._class === core.class.TxUpdateDoc) expect(Object.keys((tx as TxUpdateDoc<Doc>).operations)).toEqual(['status'])
    }

    for (const [person, path, body] of [['head', 'approve', {}], ['head', 'reject', { reason: 'Thiếu báo giá thứ hai' }], ['an', 'withdraw', {}]] as const) {
      const { ws, id } = await issueAtGate()
      await decide(ws.client, person, `${id}/${path}`, body)
      const filed = await steps(ws)
      expect(filed.map((tx) => tx._class)).toEqual([core.class.TxCreateDoc, core.class.TxUpdateDoc])
      filed.forEach(expectFiled)
    }

    const canceled = await issueAtGate()
    await canceled.ws.send(moveIssue('an', CANCELED))
    const filed = await steps(canceled.ws)
    expect(filed).toHaveLength(2)
    filed.forEach(expectFiled)
  })

  it('applies only one of two concurrent approves and answers the other not_active', async () => {
    const { ws, id } = await issueAtGate()
    const approve = async (): Promise<string | undefined> => await decideAs(ws.client, 'acc-head' as AccountUuid, id as Ref<ApprovalRequest>, 'approve', '')
    expect((await Promise.all([approve(), approve()])).sort()).toEqual(['not_active', undefined])
    const moves = ws.rows(core.class.TxCUD).filter((tx) => Reflect.get(tx, 'objectId') === ISSUE && Reflect.get(tx, 'operations')?.status !== undefined)
    expect(moves.map((tx) => Reflect.get(tx, 'operations').status)).toEqual([QUOTE, TODO, GATE, BOUGHT])
  })
})

const CAR = 'res-car'
const ROOM = 'res-room'
const BOOKING = 'event-1' as Ref<Event>
const CALENDAR_SPACE = 'calendar:space:Calendar' as Ref<Space>
const HOUR = 60 * 60 * 1000
const START = Date.UTC(2026, 9, 12, 2)

function bookingWorkspace (): MemoryWorkspace {
  const ws = memoryWorkspace()
  ws.seed(RESOURCE_CLASS, CAR, { name: 'Xe 7 chỗ', type: 'car', needsApproval: true, approver: 'emp-binh', archived: false })
  ws.seed(RESOURCE_CLASS, ROOM, { name: 'Phòng họp lớn', type: 'room', needsApproval: true, archived: false })
  return ws
}

// The organizer's copy as Lịch writes it; only the fields the engine reads.
function newBooking (person: string, fields: Record<string, Json> = {}, id: string = BOOKING): TxCreateDoc<Doc> {
  return userTx(`soc-${person}`).createTxCreateDoc<Doc>(
    calendar.class.Event,
    CALENDAR_SPACE,
    {
      eventId: `ev-${id}`,
      title: 'Gặp khách Long An',
      date: START,
      dueDate: START + 2 * HOUR,
      allDay: false,
      access: 'owner',
      user: `soc-${person}`,
      servoneResource: CAR,
      servoneBookingState: 'pending',
      ...fields
    },
    id as Ref<Doc>
  )
}

function updateBooking (person: string, operations: Record<string, Json>, id: string = BOOKING): TxUpdateDoc<Doc> {
  return userTx(`soc-${person}`).createTxUpdateDoc<Doc>(calendar.class.Event, CALENDAR_SPACE, id as Ref<Doc>, operations)
}

const bookingState = (ws: MemoryWorkspace, id: string = BOOKING): string | undefined =>
  Reflect.get([calendar.class.Event, calendar.class.ReccuringInstance].flatMap((cls) => ws.rows(cls)).find((row) => row._id === id) ?? {}, 'servoneBookingState')

async function pendingBooking (): Promise<{ ws: MemoryWorkspace, id: string }> {
  const ws = bookingWorkspace()
  await ws.send(newBooking('an'))
  return { ws, id: ws.rows(request.class.Request)[0]._id }
}

describe('booking approvals', () => {
  it('sends a pending booking to the resource\'s approver, filed by the booker, once per redelivery', async () => {
    const ws = bookingWorkspace()
    const create = newBooking('an')
    await ws.send(create)
    await onTx(ws.client, create)
    expect(ws.rows(request.class.Request)).toMatchObject([
      { attachedTo: BOOKING, requested: ['emp-binh'], status: RequestStatus.Active, servoneAction: 'cal.booking', servoneResource: CAR, createdBy: 'soc-an' }
    ])
    expect(bookingState(ws)).toBe('pending')
  })

  it('sends it to the booker\'s manager when the resource has no approver, or when the booker is the approver', async () => {
    const noApprover = bookingWorkspace()
    await noApprover.send(newBooking('an', { servoneResource: ROOM }))
    expect(noApprover.rows(request.class.Request)).toMatchObject([{ requested: ['emp-head'], status: RequestStatus.Active }])

    const own = bookingWorkspace()
    await own.send(newBooking('binh'))
    expect(own.rows(request.class.Request)).toMatchObject([{ requested: ['emp-head'], status: RequestStatus.Active }])
  })

  it('opens nothing for a confirmed booking or a guest\'s copy', async () => {
    const ws = bookingWorkspace()
    await ws.send(newBooking('an', { servoneBookingState: 'confirmed' }))
    await ws.send(newBooking('an', { access: 'reader' }, 'event-guest'))
    expect(ws.rows(request.class.Request)).toEqual([])
  })

  it('confirms on approve, rejects with the reason, and cancels on withdraw', async () => {
    const approved = await pendingBooking()
    expect(await decide(approved.ws.client, 'binh', `${approved.id}/approve`)).toEqual({ status: 200, body: { isOk: true } })
    expect(bookingState(approved.ws)).toBe('confirmed')

    const rejected = await pendingBooking()
    expect(await decide(rejected.ws.client, 'binh', `${rejected.id}/reject`, { reason: 'Xe đi bảo dưỡng' })).toEqual({ status: 200, body: { isOk: true } })
    expect(bookingState(rejected.ws)).toBe('rejected')
    expect(rejected.ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Rejected, servoneReason: 'Xe đi bảo dưỡng' })

    const withdrawn = await pendingBooking()
    expect(await decide(withdrawn.ws.client, 'an', `${withdrawn.id}/withdraw`)).toEqual({ status: 200, body: { isOk: true } })
    expect(bookingState(withdrawn.ws)).toBe('cancelled')
  })

  it('refuses the booker approving their own booking', async () => {
    const { ws, id } = await pendingBooking()
    expect(await decide(ws.client, 'an', `${id}/approve`)).toEqual({ status: 403, body: { error: 'not_approver' } })
  })

  it('opens a new request when an approved booking is moved back to pending', async () => {
    const { ws, id } = await pendingBooking()
    await decide(ws.client, 'binh', `${id}/approve`)
    await ws.send(updateBooking('an', { date: START + HOUR, dueDate: START + 3 * HOUR, servoneBookingState: 'pending' }))
    expect(ws.rows(request.class.Request)).toMatchObject([{ status: RequestStatus.Completed }, { status: RequestStatus.Active, requested: ['emp-binh'] }])
  })

  it('keeps the request when a pending booking moves, and replaces it when the resource changes', async () => {
    const { ws } = await pendingBooking()
    await ws.send(updateBooking('an', { date: START + HOUR, dueDate: START + 3 * HOUR, servoneBookingState: 'pending' }))
    expect(ws.rows(request.class.Request)).toHaveLength(1)

    await ws.send(updateBooking('an', { servoneResource: ROOM, servoneBookingState: 'pending' }))
    expect(ws.rows(request.class.Request)).toMatchObject([
      { status: RequestStatus.Cancelled, servoneResource: CAR },
      { status: RequestStatus.Active, servoneResource: ROOM, requested: ['emp-head'] }
    ])
  })

  it('closes the request when the booking is cancelled, loses its resource, or is deleted', async () => {
    const cancelled = await pendingBooking()
    await cancelled.ws.send(updateBooking('an', { servoneBookingState: 'cancelled' }))
    expect(cancelled.ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Cancelled })

    const unset = await pendingBooking()
    await unset.ws.send(updateBooking('an', { $unset: { servoneResource: true } }))
    expect(unset.ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Cancelled })

    const deleted = await pendingBooking()
    await deleted.ws.send(userTx('soc-an').createTxRemoveDoc(calendar.class.Event, CALENDAR_SPACE, BOOKING))
    expect(deleted.ws.rows(request.class.Request)[0]).toMatchObject({ status: RequestStatus.Cancelled })
  })

  it('lets an occurrence split off a pending series ride on the series\' request and outcome', async () => {
    const ws = bookingWorkspace()
    await ws.send(newBooking('an', { rules: [{ freq: 'WEEKLY' }] }))
    await ws.send(userTx('soc-an').createTxCreateDoc<Doc>(calendar.class.ReccuringInstance, CALENDAR_SPACE, {
      eventId: 'ev-instance',
      recurringEventId: `ev-${BOOKING}`,
      originalStartTime: START + 7 * 24 * HOUR,
      date: START + 7 * 24 * HOUR,
      dueDate: START + 7 * 24 * HOUR + 2 * HOUR,
      access: 'owner',
      user: 'soc-an',
      servoneResource: CAR,
      servoneBookingState: 'pending'
    }, 'event-instance' as Ref<Doc>))
    const requests = ws.rows(request.class.Request)
    expect(requests).toHaveLength(1)
    await decide(ws.client, 'binh', `${requests[0]._id}/approve`)
    expect([bookingState(ws), bookingState(ws, 'event-instance')]).toEqual(['confirmed', 'confirmed'])
  })

  it('expires a booking still pending at its start, closing the request with the reason, and only once', async () => {
    const { ws } = await pendingBooking()
    await ws.send(newBooking('an', { date: START + 24 * HOUR, dueDate: START + 26 * HOUR }, 'event-later'))
    await expireBookings(ws.client, START - 1)
    expect(bookingState(ws)).toBe('pending')

    await expireBookings(ws.client, START)
    await expireBookings(ws.client, START)
    expect([bookingState(ws), bookingState(ws, 'event-later')]).toEqual(['expired', 'pending'])
    expect(ws.rows(request.class.Request)).toMatchObject([
      { attachedTo: BOOKING, status: RequestStatus.Cancelled, servoneReason: EXPIRED_REASON },
      { attachedTo: 'event-later', status: RequestStatus.Active }
    ])
    expect(ws.rows(core.class.TxCUD).filter((tx) => Reflect.get(tx, 'operations')?.servoneBookingState === 'expired')).toHaveLength(1)
  })

  it('leaves an approved booking alone at its start', async () => {
    const { ws, id } = await pendingBooking()
    await decide(ws.client, 'binh', `${id}/approve`)
    await expireBookings(ws.client, START + HOUR)
    expect(bookingState(ws)).toBe('confirmed')
  })
})
