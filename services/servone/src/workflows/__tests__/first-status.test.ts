import core, { type Doc, type Ref } from '@hcengineering/core'
import task, { type ProjectType, type TaskType } from '@hcengineering/task'
import tracker, { type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'
import { moveFirstStatusesToNotStarted } from '../first-status'
import { type MemoryWorkspace, memoryWorkspace } from './memory-workspace'

const { UnStarted, ToDo, Active } = task.statusCategory

function seedStatus (ws: MemoryWorkspace, id: string, name: string, category: string): void {
  ws.seed(tracker.class.IssueStatus, id, { ofAttribute: tracker.attribute.IssueStatus, name, category })
}

// A project with its own type and one task type, as ensureOwnType leaves it; items sit on the given statuses.
function seedProject (ws: MemoryWorkspace, project: string, typeId: string, statuses: string[], items: Record<string, string>): void {
  const kind = `${typeId}:kind`
  ws.seed(task.class.ProjectType, typeId, { tasks: [kind], statuses: statuses.map((_id) => ({ _id, taskType: kind })) })
  ws.seed(task.class.TaskType, kind, { parent: typeId, statuses })
  ws.seed(tracker.class.Project, project, { type: typeId, defaultIssueStatus: statuses[0] })
  for (const [item, status] of Object.entries(items)) {
    ws.seed(tracker.class.Issue, item, { space: project, status })
  }
}

// Seeds from before commit 32615ef37: workflows start in ToDo, sharing "New" with a Tracker project.
function oldWorkspace (): MemoryWorkspace {
  const ws = memoryWorkspace()
  seedStatus(ws, 'st-moi-todo', 'Mới', ToDo)
  seedStatus(ws, 'st-new-todo', 'New', ToDo)
  seedStatus(ws, 'st-doing', 'Đang làm', Active)
  seedStatus(ws, 'st-screening', 'Screening', Active)
  seedProject(ws, 'proj-td', 'servone:projectType:Workflow:of:proj-td', ['st-moi-todo', 'st-doing'], { 'td-1': 'st-moi-todo', 'td-2': 'st-moi-todo', 'td-3': 'st-doing' })
  seedProject(ws, 'proj-hiring', 'servone:projectType:Workflow:of:proj-hiring', ['st-new-todo', 'st-screening'], { 'hi-1': 'st-new-todo' })
  seedProject(ws, 'proj-tracker', 'tracker-type-classic', ['st-new-todo', 'st-doing'], { 'tr-1': 'st-new-todo' })
  return ws
}

function rowOf<T extends Doc> (ws: MemoryWorkspace, cls: Ref<T['_class']>, id: string): T {
  const row = ws.rows(cls).find((it) => it._id === id)
  if (row === undefined) throw new Error(`no ${cls} ${id}`)
  return row as T
}

function unstartedId (ws: MemoryWorkspace, name: string): Ref<IssueStatus> {
  const found = ws.rows(tracker.class.IssueStatus).map((row) => row as IssueStatus).filter((it) => it.name === name && it.category === UnStarted)
  expect(found).toHaveLength(1)
  return found[0]._id
}

describe('moveFirstStatusesToNotStarted', () => {
  it('moves an old workflow\'s first status, its items and its default into Not started, keeping the order', async () => {
    const ws = oldWorkspace()
    await moveFirstStatusesToNotStarted(ws.client)
    const moi = unstartedId(ws, 'Mới')
    const typeId = 'servone:projectType:Workflow:of:proj-td'

    expect(rowOf<ProjectType>(ws, task.class.ProjectType, typeId).statuses.map((it) => it._id)).toEqual([moi, 'st-doing'])
    expect(rowOf<TaskType>(ws, task.class.TaskType, `${typeId}:kind`).statuses).toEqual([moi, 'st-doing'])
    expect(rowOf<Project>(ws, tracker.class.Project, 'proj-td').defaultIssueStatus).toBe(moi)
    expect(['td-1', 'td-2', 'td-3'].map((id) => rowOf<Issue>(ws, tracker.class.Issue, id).status)).toEqual([moi, moi, 'st-doing'])
  })

  it('reuses a Not started status a newer workflow already created', async () => {
    const ws = oldWorkspace()
    seedStatus(ws, 'st-moi-unstarted', 'Mới', UnStarted)
    await moveFirstStatusesToNotStarted(ws.client)
    expect(unstartedId(ws, 'Mới')).toBe('st-moi-unstarted')
    expect(rowOf<Issue>(ws, tracker.class.Issue, 'td-1').status).toBe('st-moi-unstarted')
  })

  it('leaves a Tracker project on the shared ToDo status and keeps that status', async () => {
    const ws = oldWorkspace()
    await moveFirstStatusesToNotStarted(ws.client)
    const newStatus = unstartedId(ws, 'New')

    expect(rowOf<Issue>(ws, tracker.class.Issue, 'hi-1').status).toBe(newStatus)
    expect(rowOf<ProjectType>(ws, task.class.ProjectType, 'tracker-type-classic').statuses.map((it) => it._id)).toEqual(['st-new-todo', 'st-doing'])
    expect(rowOf<TaskType>(ws, task.class.TaskType, 'tracker-type-classic:kind').statuses).toEqual(['st-new-todo', 'st-doing'])
    expect(rowOf<Project>(ws, tracker.class.Project, 'proj-tracker').defaultIssueStatus).toBe('st-new-todo')
    expect(rowOf<Issue>(ws, tracker.class.Issue, 'tr-1').status).toBe('st-new-todo')
    expect(rowOf<IssueStatus>(ws, tracker.class.IssueStatus, 'st-new-todo').category).toBe(ToDo)
  })

  it('skips a ToDo first status that no template starts with', async () => {
    const ws = memoryWorkspace()
    seedStatus(ws, 'st-intake', 'Intake', ToDo)
    seedProject(ws, 'proj-custom', 'servone:projectType:Workflow:of:proj-custom', ['st-intake'], { 'cu-1': 'st-intake' })
    await moveFirstStatusesToNotStarted(ws.client)
    expect(ws.sent).toEqual([])
  })

  it('writes nothing once the workspace is fixed', async () => {
    const ws = oldWorkspace()
    await moveFirstStatusesToNotStarted(ws.client)
    const written = ws.sent.length
    await moveFirstStatusesToNotStarted(ws.client)
    expect(ws.sent).toHaveLength(written)
    expect(ws.sent.some((tx) => tx.objectSpace === core.space.Model)).toBe(true)
  })
})
