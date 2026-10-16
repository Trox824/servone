import contact from '@hcengineering/contact'
import type { AccountUuid, Ref } from '@hcengineering/core'
import hr from '@hcengineering/hr'
import task from '@hcengineering/task'
import tracker, { type IssueStatus, type Project } from '@hcengineering/tracker'
import { formTemplateClass, parseFormDefinition } from '@servone/forms'
import { parseHelpdeskSettings } from '@servone/notify-rules'
import type { Json } from '../../http-json'
import { createWorkflow } from '../create'
import { type MemoryWorkspace, memoryWorkspace as emptyWorkspace } from './memory-workspace'

type ApproverRule = { by: 'manager' }

const CREATOR = 'acc-creator' as AccountUuid
const SALES = 'dept-sales'

function memoryWorkspace (): MemoryWorkspace {
  const ws = emptyWorkspace()
  ws.seed(hr.class.Department, SALES, { name: 'Kinh doanh', members: ['emp-an', 'emp-binh', 'emp-left'] })
  ws.seed(contact.mixin.Employee, 'emp-an', { active: true, personUuid: 'acc-an' })
  ws.seed(contact.mixin.Employee, 'emp-binh', { active: true, personUuid: 'acc-binh' })
  ws.seed(contact.mixin.Employee, 'emp-left', { active: false, personUuid: 'acc-left' })
  return ws
}

async function projectOf (ws: ReturnType<typeof memoryWorkspace>, id: Ref<Project>): Promise<Project> {
  const [project] = await ws.client.findAll(tracker.class.Project, { _id: id })
  if (project === undefined) throw new Error(`no project ${id}`)
  return project
}

// Status names in the project's own type order, with their category and approval marker.
async function statusChain (ws: ReturnType<typeof memoryWorkspace>, id: Ref<Project>): Promise<Array<[string, string, ApproverRule | undefined]>> {
  const project = await projectOf(ws, id)
  const [type] = await ws.client.findAll(task.class.ProjectType, { _id: project.type })
  const statuses = await ws.client.findAll(tracker.class.IssueStatus, {})
  return type.statuses.map((entry) => {
    const status = statuses.find((it) => it._id === entry._id)
    if (status === undefined) throw new Error(`no status ${entry._id}`)
    return [status.name, status.category ?? '', Reflect.get(entry, 'servoneApproval')]
  })
}

// Each task type's name and status names, in the project's type order.
async function taskTypes (ws: ReturnType<typeof memoryWorkspace>, id: Ref<Project>): Promise<Array<[string, string[]]>> {
  const project = await projectOf(ws, id)
  const [type] = await ws.client.findAll(task.class.ProjectType, { _id: project.type })
  const kinds = await ws.client.findAll(task.class.TaskType, {})
  const statuses = await ws.client.findAll(tracker.class.IssueStatus, {})
  return type.tasks.map((kindId) => {
    const kind = kinds.find((it) => it._id === kindId)
    if (kind === undefined) throw new Error(`no task type ${kindId}`)
    return [kind.name, kind.statuses.map((statusId) => statuses.find((it) => it._id === statusId)?.name ?? '')]
  })
}

async function statusIdByName (ws: ReturnType<typeof memoryWorkspace>, name: string): Promise<Ref<IssueStatus> | undefined> {
  return (await ws.client.findOne(tracker.class.IssueStatus, { name }))?._id
}

async function create (ws: ReturnType<typeof memoryWorkspace>, body: Json): Promise<Ref<Project>> {
  const outcome = await createWorkflow(ws.client, CREATOR, body)
  if (!('project' in outcome)) throw new Error(`refused: ${outcome.error}`)
  return outcome.project
}

const { UnStarted, ToDo, Active, Won, Lost } = task.statusCategory
const MANAGER: ApproverRule = { by: 'manager' }

describe('createWorkflow', () => {
  it('gives a Mua hàng workflow its own statuses in order, with manager approval on Chờ duyệt only', async () => {
    const ws = memoryWorkspace()
    const project = await create(ws, { name: 'Mua hàng', department: SALES, template: 'mua-hang', language: 'vi' })
    expect(await statusChain(ws, project)).toEqual([
      ['Đề nghị', UnStarted, undefined],
      ['Lấy báo giá', Active, undefined],
      ['Chờ duyệt', Active, MANAGER],
      ['Đã mua', Won, undefined],
      ['Hủy', Lost, undefined]
    ])
  })
  it('writes a Tuyển dụng workflow in the creator\'s English with approval on Offer', async () => {
    const ws = memoryWorkspace()
    const project = await create(ws, { name: 'Hiring', department: SALES, template: 'tuyen-dung', language: 'en' })
    expect(await statusChain(ws, project)).toEqual([
      ['New', UnStarted, undefined],
      ['Screening', Active, undefined],
      ['Interview', Active, undefined],
      ['Offer', Active, MANAGER],
      ['Hired', Won, undefined],
      ['Not continued', Lost, undefined]
    ])
  })

  it('gives an IT Helpdesk workflow four ticket types, with manager approval on Change approval right after New', async () => {
    const ws = memoryWorkspace()
    const project = await create(ws, { name: 'IT Helpdesk', department: SALES, template: 'it-helpdesk', language: 'en' })
    const common = ['New', 'Assigned', 'In Progress', 'Waiting on requester', 'Resolved', 'Closed', 'Canceled']
    expect(await taskTypes(ws, project)).toEqual([
      ['Incident', common],
      ['Service request', common],
      ['Problem', common],
      ['Change', ['New', 'Change approval', ...common.slice(1)]]
    ])
    const chain = await statusChain(ws, project)
    expect(chain.filter(([, , approval]) => approval !== undefined)).toEqual([['Change approval', ToDo, MANAGER]])
    expect(chain.find(([name]) => name === 'New')?.[1]).toBe(UnStarted)
    expect((await projectOf(ws, project)).defaultIssueStatus).toBe(await statusIdByName(ws, 'New'))
  })
  it('names the IT Helpdesk statuses in Vietnamese for a Vietnamese creator', async () => {
    const ws = memoryWorkspace()
    const project = await create(ws, { name: 'Hỗ trợ IT', department: SALES, template: 'it-helpdesk', language: 'vi' })
    const common = ['Mới', 'Đã phân công', 'Đang xử lý', 'Chờ người yêu cầu', 'Đã giải quyết', 'Đã đóng', 'Đã hủy']
    expect(await taskTypes(ws, project)).toEqual([
      ['Sự cố', common],
      ['Yêu cầu dịch vụ', common],
      ['Vấn đề', common],
      ['Thay đổi', ['Mới', 'Duyệt thay đổi', ...common.slice(1)]]
    ])
  })
  it('starts an IT Helpdesk workflow with SLA targets per priority and auto-close after 3 days', async () => {
    const ws = memoryWorkspace()
    const before = Date.now()
    const project = await create(ws, { name: 'IT Helpdesk', department: SALES, template: 'it-helpdesk', language: 'en' })
    const settings = parseHelpdeskSettings(await projectOf(ws, project))
    expect(settings).toEqual({
      sla: {
        since: expect.any(Number),
        targets: {
          urgent: { respondHours: 1, resolveHours: 4 },
          high: { respondHours: 4, resolveHours: 24 },
          medium: { respondHours: 24, resolveHours: 72 },
          low: { respondHours: 48, resolveHours: 120 }
        }
      },
      autoCloseDays: 3
    })
    expect(settings.sla?.since).toBeGreaterThanOrEqual(before)
    expect(parseHelpdeskSettings(await projectOf(ws, await create(ws, { name: 'Mua hàng', department: SALES, template: 'mua-hang', language: 'vi' })))).toEqual({})
  })
  it('gives the IT Helpdesk form a subject, requester email, category, impact and description', async () => {
    const ws = memoryWorkspace()
    const project = await create(ws, { name: 'IT Helpdesk', department: SALES, template: 'it-helpdesk', language: 'en' })
    const [stored] = await ws.client.findAll(formTemplateClass, { space: project })
    const form = parseFormDefinition(stored.servoneForm ?? '')
    if (!form.isValid) throw new Error(`invalid form: ${form.issue.problem}`)
    expect(form.definition.fields.map((field) => [field.label, field.kind, field.target.to, field.isRequired, field.options])).toEqual([
      ['Subject', 'text', 'title', true, undefined],
      ['Requester email', 'email', 'append', true, undefined],
      ['Category', 'select', 'append', true, ['Hardware', 'Software', 'Access', 'Network', 'Other']],
      ['Impact', 'select', 'priority', true, ['Urgent', 'High', 'Medium', 'Low']],
      ['Description', 'longText', 'description', false, undefined]
    ])
    const [incident] = await ws.client.findAll(task.class.TaskType, { name: 'Incident' })
    expect(stored.kind).toBe(incident._id)
  })

  it('files the workflow under its department with the creator as owner and active staff as members', async () => {
    const ws = memoryWorkspace()
    const project = await create(ws, { name: 'Mua hàng', department: SALES, template: 'mua-hang', language: 'vi' })
    const stored = await projectOf(ws, project)
    expect(stored).toMatchObject({ servoneDepartment: SALES, servoneSyncDepartment: SALES, owners: [CREATOR], private: false })
    expect(stored.members).toEqual([CREATOR, 'acc-an', 'acc-binh'])
    expect(stored.defaultIssueStatus).toBe(await statusIdByName(ws, 'Đề nghị'))
  })
  it('writes the template\'s form as the project\'s default template, and none for Trống', async () => {
    const ws = memoryWorkspace()
    const project = await create(ws, { name: 'Hợp đồng', department: SALES, template: 'hop-dong', language: 'vi' })
    const forms = await ws.client.findAll(formTemplateClass, { space: project })
    expect(forms.map((it) => it._id)).toEqual([Reflect.get(await projectOf(ws, project), 'servoneDefaultTemplate')])
    const form = parseFormDefinition(forms[0].servoneForm ?? '')
    if (!form.isValid) throw new Error(`invalid form: ${form.issue.problem}`)
    expect(form.definition.fields.map((field) => [field.label, field.target.to, field.isRequired])).toEqual([
      ['Tên hợp đồng', 'title', true],
      ['Đối tác', 'append', true],
      ['Giá trị (VND)', 'append', true],
      ['Ngày hết hạn', 'dueDate', false]
    ])

    const blank = await create(ws, { name: 'Việc chung', department: SALES, template: 'trong', language: 'vi' })
    expect(await ws.client.findAll(formTemplateClass, { space: blank })).toHaveLength(0)
    expect(Reflect.get(await projectOf(ws, blank), 'servoneDefaultTemplate')).toBeUndefined()
  })

  it('records which template made the workflow, so People can find the Nhận việc one', async () => {
    const ws = memoryWorkspace()
    const project = await create(ws, { name: 'Nhận việc', department: SALES, template: 'nhan-viec', language: 'vi' })
    expect(Reflect.get(await projectOf(ws, project), 'servoneTemplate')).toBe('nhan-viec')
    expect(await statusChain(ws, project)).toEqual([
      ['Mới', UnStarted, undefined],
      ['Đang làm', Active, undefined],
      ['Hoàn thành', Won, undefined],
      ['Đã hủy', Lost, undefined]
    ])
  })

  it('derives the identifier from a Vietnamese name and keeps it unique', async () => {
    const ws = memoryWorkspace()
    const first = await create(ws, { name: 'Tuyển dụng', department: SALES, template: 'tuyen-dung', language: 'vi' })
    const second = await create(ws, { name: 'tuyển dụng miền Nam', department: SALES, template: 'tuyen-dung', language: 'vi' })
    const third = await create(ws, { name: 'Tuyển Dụng', department: SALES, template: 'tuyen-dung', language: 'vi' })
    const projects = await Promise.all([first, second, third].map(async (id) => await projectOf(ws, id)))
    expect(projects.map((it) => it.identifier)).toEqual(['TD', 'TDMN', 'TD2'])
  })

  it.each([
    [{ name: '   ', department: SALES, template: 'mua-hang', language: 'vi' }, 'invalid_name'],
    [{ name: 'x'.repeat(101), department: SALES, template: 'mua-hang', language: 'vi' }, 'invalid_name'],
    [{ name: 'Mua hàng', department: 'dept-gone', template: 'mua-hang', language: 'vi' }, 'unknown_department'],
    [{ name: 'Mua hàng', department: SALES, template: 'kho', language: 'vi' }, 'unknown_template']
  ])('refuses %j with %s and writes nothing', async (body, error) => {
    const ws = memoryWorkspace()
    expect(await createWorkflow(ws.client, CREATOR, body)).toEqual({ error })
    expect(ws.sent).toEqual([])
  })
})
