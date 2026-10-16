import core, { AccountRole, type Class, type Ref } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { type Issue, type IssueStatus, type IssueTemplate, type Project } from '@hcengineering/tracker'
import {
  addStatus,
  deleteStatus,
  moveStatus,
  renameStatus,
  setDefaultStatus,
  setStatusColor
} from '../project-statuses/edit'
import { projectStatusGroups, type ProjectStatusRow } from '../project-statuses/read'
import { createWorkspace, type MemoryWorkspace, sessionFor, system } from './harness'
import { addBugKind, addIssue, addProject, addTemplate, readProject } from './project-harness'

interface ScrumProject extends Project {
  sprintWipLimits?: string
}
interface FormTemplate extends IssueTemplate {
  servoneFormStatus?: Ref<IssueStatus> | null
}
const scrumProjectClass: Ref<Class<ScrumProject>> = tracker.class.Project
const formTemplateClass: Ref<Class<FormTemplate>> = tracker.class.IssueTemplate

async function groupNames (ws: MemoryWorkspace, project: Ref<Project>): Promise<string[][]> {
  const groups = await projectStatusGroups(sessionFor(ws, 'member', AccountRole.User), project)
  return groups.map((group) => group.rows.map((row) => row.name))
}

async function kindStatusNames (ws: MemoryWorkspace, project: Ref<Project>): Promise<string[][]> {
  const { type } = await readProject(ws, project)
  const kinds = await ws.client.findAll(task.class.TaskType, { parent: type })
  const statuses = await ws.client.findAll(tracker.class.IssueStatus, {})
  return kinds.map((kind) => kind.statuses.map((id) => statuses.find((it) => it._id === id)?.name ?? id))
}

async function issueStatusName (ws: MemoryWorkspace, id: Ref<Issue>): Promise<string> {
  const [issue] = await ws.client.findAll(tracker.class.Issue, { _id: id })
  const [status] = await ws.client.findAll(tracker.class.IssueStatus, { _id: issue.status })
  return status.name
}

describe('renameStatus', () => {
  it('renames only in this project and keeps its issues in the renamed status', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const other = await addProject(ws, 'OTHER')
    const issue = await addIssue(ws, own, tracker.status.Todo)
    const otherIssue = await addIssue(ws, other, tracker.status.Todo)

    await renameStatus(sessionFor(ws), own, tracker.status.Todo, 'Cần làm')

    expect(await groupNames(ws, own)).toEqual([['Backlog'], ['Cần làm'], ['In Progress'], ['Done'], ['Canceled']])
    expect(await groupNames(ws, other)).toEqual([['Backlog'], ['Todo'], ['In Progress'], ['Done'], ['Canceled']])
    expect(await issueStatusName(ws, issue)).toBe('Cần làm')
    expect(await issueStatusName(ws, otherIssue)).toBe('Todo')
  })

  it('renames a status only this project uses in place, leaving issues as they are', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const issue = await addIssue(ws, own, tracker.status.Todo)
    await renameStatus(sessionFor(ws), own, tracker.status.Todo, 'Cần làm')
    const [forked] = await ws.client.findAll(tracker.class.Issue, { _id: issue })

    await renameStatus(sessionFor(ws), own, forked.status, 'Việc cần làm')

    const [after] = await ws.client.findAll(tracker.class.Issue, { _id: issue })
    expect(after.status).toBe(forked.status)
    expect(await issueStatusName(ws, issue)).toBe('Việc cần làm')
    expect(await groupNames(ws, own)).toEqual([['Backlog'], ['Việc cần làm'], ['In Progress'], ['Done'], ['Canceled']])
  })

  it("moves the project's default status, form status and WIP limit to the renamed status", async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const template = await addTemplate(ws, own, tracker.taskTypes.Issue)
    await ws.client.tx(
      system.createTxUpdateDoc<ScrumProject>(scrumProjectClass, core.space.Space, own, {
        defaultIssueStatus: tracker.status.Todo,
        sprintWipLimits: JSON.stringify({ Todo: 3, 'In Progress': 2 })
      })
    )
    await ws.client.tx(system.createTxUpdateDoc<FormTemplate>(formTemplateClass, own, template, { servoneFormStatus: tracker.status.Todo }))

    await renameStatus(sessionFor(ws), own, tracker.status.Todo, 'Cần làm')

    const [renamed] = (await projectStatusGroups(sessionFor(ws), own))[1].rows
    expect(renamed.name).toBe('Cần làm')
    const [project] = await ws.client.findAll(scrumProjectClass, { _id: own })
    expect(project.defaultIssueStatus).toBe(renamed.status)
    expect(JSON.parse(project.sprintWipLimits ?? '')).toEqual({ 'Cần làm': 3, 'In Progress': 2 })
    const [form] = await ws.client.findAll(formTemplateClass, { _id: template })
    expect(form.servoneFormStatus).toBe(renamed.status)
  })

  it('refuses a blank name or one another status of the project already has', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')

    await expect(renameStatus(sessionFor(ws), own, tracker.status.Todo, '  ')).rejects.toMatchObject({ code: 'invalid' })
    await expect(renameStatus(sessionFor(ws), own, tracker.status.Todo, ' in progress ')).rejects.toMatchObject({
      code: 'invalid'
    })
    expect(await groupNames(ws, own)).toEqual([['Backlog'], ['Todo'], ['In Progress'], ['Done'], ['Canceled']])
  })
})

describe('addStatus', () => {
  it('appends the status to the end of its category in every task type', async () => {
    const ws = createWorkspace()
    await addBugKind(ws)
    const own = await addProject(ws, 'OWN')

    await addStatus(sessionFor(ws), own, { name: 'In Review', category: task.statusCategory.Active })
    await addStatus(sessionFor(ws), own, { name: 'Chờ khách', category: task.statusCategory.Active })

    const workflow = ['Backlog', 'Todo', 'In Progress', 'In Review', 'Chờ khách', 'Done', 'Canceled']
    expect(await kindStatusNames(ws, own)).toEqual([workflow, workflow])
    expect(await groupNames(ws, own)).toEqual([['Backlog'], ['Todo'], ['In Progress', 'In Review', 'Chờ khách'], ['Done'], ['Canceled']])
  })

  it('refuses a name the project already has', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')

    await expect(
      addStatus(sessionFor(ws), own, { name: 'done', category: task.statusCategory.Active })
    ).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('moveStatus', () => {
  it('reorders the status inside its category in every task type', async () => {
    const ws = createWorkspace()
    await addBugKind(ws)
    const own = await addProject(ws, 'OWN')
    const review = await addStatus(sessionFor(ws), own, { name: 'In Review', category: task.statusCategory.Active })

    await moveStatus(sessionFor(ws), own, review, 0)

    const workflow = ['Backlog', 'Todo', 'In Review', 'In Progress', 'Done', 'Canceled']
    expect(await kindStatusNames(ws, own)).toEqual([workflow, workflow])
    expect(await groupNames(ws, own)).toEqual([['Backlog'], ['Todo'], ['In Review', 'In Progress'], ['Done'], ['Canceled']])

    await moveStatus(sessionFor(ws), own, review, 9)

    expect(await groupNames(ws, own)).toEqual([['Backlog'], ['Todo'], ['In Progress', 'In Review'], ['Done'], ['Canceled']])
  })
})

describe('setDefaultStatus', () => {
  async function defaultName (ws: MemoryWorkspace, project: Ref<Project>): Promise<string | undefined> {
    const groups = await projectStatusGroups(sessionFor(ws), project)
    return groups.flatMap((group) => group.rows).find((row) => row.isDefault)?.name
  }

  it('marks a Backlog or Todo status as the default for new issues', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')

    await setDefaultStatus(sessionFor(ws), own, tracker.status.Todo)

    expect(await defaultName(ws, own)).toBe('Todo')
  })

  it('refuses a status that is already under way or closed', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')

    await expect(setDefaultStatus(sessionFor(ws), own, tracker.status.InProgress)).rejects.toMatchObject({
      code: 'invalid'
    })
    expect(await defaultName(ws, own)).toBeUndefined()
  })
})

describe('deleteStatus', () => {
  it('moves its issues to the chosen status, clears forms filing into it and removes it', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const review = await addStatus(sessionFor(ws), own, { name: 'In Review', category: task.statusCategory.Active })
    const issue = await addIssue(ws, own, review)
    const template = await addTemplate(ws, own, tracker.taskTypes.Issue)
    await ws.client.tx(system.createTxUpdateDoc<FormTemplate>(formTemplateClass, own, template, { servoneFormStatus: review }))

    await deleteStatus(sessionFor(ws), own, review, tracker.status.Done)

    expect(await issueStatusName(ws, issue)).toBe('Done')
    expect(await groupNames(ws, own)).toEqual([['Backlog'], ['Todo'], ['In Progress'], ['Done'], ['Canceled']])
    const [form] = await ws.client.findAll(formTemplateClass, { _id: template })
    expect(form.servoneFormStatus).toBeNull()
  })

  it('refuses the default status and the last status of a category', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    await addStatus(sessionFor(ws), own, { name: 'Chờ', category: task.statusCategory.UnStarted })
    await setDefaultStatus(sessionFor(ws), own, tracker.status.Backlog)
    const issue = await addIssue(ws, own, tracker.status.Backlog)

    await expect(deleteStatus(sessionFor(ws), own, tracker.status.Backlog, tracker.status.Todo)).rejects.toMatchObject({
      code: 'invalid'
    })
    await expect(deleteStatus(sessionFor(ws), own, tracker.status.Done, tracker.status.Todo)).rejects.toMatchObject({
      code: 'invalid'
    })
    expect(await issueStatusName(ws, issue)).toBe('Backlog')
    expect(await groupNames(ws, own)).toEqual([['Backlog', 'Chờ'], ['Todo'], ['In Progress'], ['Done'], ['Canceled']])
  })

  it('refuses to move issues into the deleted status itself or one outside the project', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const review = await addStatus(sessionFor(ws), own, { name: 'In Review', category: task.statusCategory.Active })
    const other = await addProject(ws, 'OTHER')
    const elsewhere = await addStatus(sessionFor(ws), other, { name: 'Chờ khách', category: task.statusCategory.Active })

    await expect(deleteStatus(sessionFor(ws), own, review, review)).rejects.toMatchObject({ code: 'invalid' })
    await expect(deleteStatus(sessionFor(ws), own, review, elsewhere)).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('setStatusColor', () => {
  it('colours the status in this project only', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const other = await addProject(ws, 'OTHER')
    const colourOf = async (project: Ref<Project>): Promise<ProjectStatusRow['color']> =>
      (await projectStatusGroups(sessionFor(ws), project))[1].rows[0].color

    await setStatusColor(sessionFor(ws), own, tracker.status.Todo, 7)

    expect(await colourOf(own)).toBe(7)
    expect(await colourOf(other)).not.toBe(7)
  })
})

describe('status edits', () => {
  it('refuse a member without Maintainer rights', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const member = sessionFor(ws, 'member', AccountRole.User)

    await expect(renameStatus(member, own, tracker.status.Todo, 'Cần làm')).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      addStatus(member, own, { name: 'In Review', category: task.statusCategory.Active })
    ).rejects.toMatchObject({ code: 'forbidden' })
    expect(await groupNames(ws, own)).toEqual([['Backlog'], ['Todo'], ['In Progress'], ['Done'], ['Canceled']])
  })
})
