import core, { AccountRole } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker from '@hcengineering/tracker'
import { ensureOwnType } from '../project-statuses/copy'
import { projectStatusGroups } from '../project-statuses/read'
import { baseTypeOf, ownerOf } from '../project-statuses/ids'
import { createWorkspace, type MemoryWorkspace, sessionFor, system } from './harness'
import { addIssue, addProject, addTemplate, CLASSIC_TYPE, readProject } from './project-harness'

describe('ensureOwnType', () => {
  it('gives the project its own type and points its issues and templates at the copies', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const other = await addProject(ws, 'OTHER')
    const issue = await addIssue(ws, own, tracker.status.Todo)
    const otherIssue = await addIssue(ws, other, tracker.status.Todo)
    const template = await addTemplate(ws, own, tracker.taskTypes.Issue)

    await ensureOwnType(sessionFor(ws), own)

    const project = await readProject(ws, own)
    expect(project.type).not.toBe(CLASSIC_TYPE)
    expect(baseTypeOf(project.type)).toBe(CLASSIC_TYPE)
    expect(ownerOf(project.type)).toBe(own)
    const [moved] = await ws.client.findAll(tracker.class.Issue, { _id: issue })
    expect(baseTypeOf(moved.kind)).toBe(tracker.taskTypes.Issue)
    expect(ownerOf(moved.kind)).toBe(own)
    expect(moved.status).toBe(tracker.status.Todo)
    const [copiedTemplate] = await ws.client.findAll(tracker.class.IssueTemplate, { _id: template })
    expect(copiedTemplate.kind).toBe(moved.kind)
    expect(copiedTemplate.children[0].kind).toBe(moved.kind)
    const [ownTask] = await ws.client.findAll(task.class.TaskType, { _id: moved.kind })
    expect(ownTask.allowedAsChildOf).toEqual([moved.kind])

    expect((await readProject(ws, other)).type).toBe(CLASSIC_TYPE)
    const [untouched] = await ws.client.findAll(tracker.class.Issue, { _id: otherIssue })
    expect(untouched.kind).toBe(tracker.taskTypes.Issue)
  })

  it('writes nothing the second time', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    await addIssue(ws, own, tracker.status.Backlog)
    await ensureOwnType(sessionFor(ws), own)
    const written = ws.sent.length

    await ensureOwnType(sessionFor(ws), own)

    expect(ws.sent.length).toBe(written)
  })

  it('moves issues added on a base kind after the copy', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const ownType = await ensureOwnType(sessionFor(ws), own)
    const late = await addIssue(ws, own, tracker.status.Backlog)

    expect(await ensureOwnType(sessionFor(ws), own)).toBe(ownType)

    const [moved] = await ws.client.findAll(tracker.class.Issue, { _id: late })
    expect(ownerOf(moved.kind)).toBe(own)
  })

  it('refuses a member without Maintainer rights', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')

    await expect(ensureOwnType(sessionFor(ws, 'member', AccountRole.User), own)).rejects.toMatchObject({
      code: 'forbidden'
    })
    expect((await readProject(ws, own)).type).toBe(CLASSIC_TYPE)
  })

  it('refuses a base type with space roles instead of dropping their permissions', async () => {
    const ws = createWorkspace()
    await ws.client.tx(system.createTxUpdateDoc(task.class.ProjectType, core.space.Model, CLASSIC_TYPE, { roles: 1 }))
    const own = await addProject(ws, 'OWN')

    await expect(ensureOwnType(sessionFor(ws), own)).rejects.toMatchObject({ code: 'invalid' })
    expect((await readProject(ws, own)).type).toBe(CLASSIC_TYPE)
  })
})

describe('projectStatusGroups', () => {
  async function namesAndCounts (
    ws: MemoryWorkspace,
    project: Parameters<typeof addIssue>[1]
  ): Promise<Array<Array<[string, number]>>> {
    const groups = await projectStatusGroups(sessionFor(ws, 'member', AccountRole.User), project)
    return groups.map((group) => group.rows.map((row) => [row.name, row.issueCount]))
  }

  it("lists the copied statuses by category with this project's issue counts", async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const other = await addProject(ws, 'OTHER')
    await addIssue(ws, own, tracker.status.Todo)
    await addIssue(ws, own, tracker.status.Todo)
    await addIssue(ws, other, tracker.status.Done)
    await ensureOwnType(sessionFor(ws), own)

    expect(await namesAndCounts(ws, own)).toEqual([
      [['Backlog', 0]],
      [['Todo', 2]],
      [['In Progress', 0]],
      [['Done', 0]],
      [['Canceled', 0]]
    ])
    expect(await namesAndCounts(ws, other)).toEqual([
      [['Backlog', 0]],
      [['Todo', 0]],
      [['In Progress', 0]],
      [['Done', 1]],
      [['Canceled', 0]]
    ])
  })
})
