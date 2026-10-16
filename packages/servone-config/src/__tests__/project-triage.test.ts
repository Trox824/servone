import { AccountRole, type Ref } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { type Project } from '@hcengineering/tracker'
import { addStatus, renameStatus, setStatusApproval, setTriage } from '../project-statuses/edit'
import { projectStatusGroups } from '../project-statuses/read'
import { addEmployee, createWorkspace, type MemoryWorkspace, sessionFor } from './harness'
import { addBugKind, addProject } from './project-harness'

async function groupNames (ws: MemoryWorkspace, project: Ref<Project>): Promise<Array<{ isTriage: boolean, names: string[] }>> {
  const groups = await projectStatusGroups(sessionFor(ws), project)
  return groups.map((group) => ({ isTriage: group.isTriage, names: group.rows.map((row) => row.name) }))
}

describe('setTriage', () => {
  it('shows the triage status as its own group on top, first in every task type, until turned off', async () => {
    const ws = createWorkspace()
    await addBugKind(ws)
    const own = await addProject(ws, 'OWN')
    const lan = await addEmployee(ws, 'Lan')
    const triage = await addStatus(sessionFor(ws), own, { name: 'Phân loại', category: task.statusCategory.UnStarted })

    await setTriage(sessionFor(ws), own, { status: triage, owner: lan.person })

    const on = await groupNames(ws, own)
    expect(on[0]).toEqual({ isTriage: true, names: ['Phân loại'] })
    expect(on[1]).toEqual({ isTriage: false, names: ['Backlog'] })
    const [project] = await ws.client.findAll(tracker.class.Project, { _id: own })
    const kinds = await ws.client.findAll(task.class.TaskType, { parent: project.type })
    expect(kinds.map((kind) => kind.statuses[0])).toEqual([triage, triage])
    expect(project).toMatchObject({ servoneTriageStatus: triage, servoneTriageOwner: lan.person })

    await setTriage(sessionFor(ws), own, undefined)

    const off = await groupNames(ws, own)
    expect(off.some((group) => group.isTriage)).toBe(false)
    expect(off[0].names).toEqual(['Phân loại', 'Backlog'])
    const [cleared] = await ws.client.findAll(tracker.class.Project, { _id: own })
    expect(cleared).not.toHaveProperty('servoneTriageStatus')
    expect(cleared).not.toHaveProperty('servoneTriageOwner')
  })

  it('keeps triage on a shared status renamed in this project', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    await addProject(ws, 'OTHER')
    const lan = await addEmployee(ws, 'Lan')
    await setTriage(sessionFor(ws), own, { status: tracker.status.Backlog, owner: lan.person })

    await renameStatus(sessionFor(ws), own, tracker.status.Backlog, 'Tiếp nhận')

    expect((await groupNames(ws, own))[0]).toEqual({ isTriage: true, names: ['Tiếp nhận'] })
  })

  it('refuses a status outside Backlog and one that requires approval', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const lan = await addEmployee(ws, 'Lan')

    await expect(setTriage(sessionFor(ws), own, { status: tracker.status.Todo, owner: lan.person })).rejects.toMatchObject({ code: 'invalid' })

    await setStatusApproval(sessionFor(ws), own, tracker.status.Backlog, { by: 'manager' })
    await expect(setTriage(sessionFor(ws), own, { status: tracker.status.Backlog, owner: lan.person })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('makes setStatusApproval refuse the triage status', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const lan = await addEmployee(ws, 'Lan')
    await setTriage(sessionFor(ws), own, { status: tracker.status.Backlog, owner: lan.person })

    await expect(setStatusApproval(sessionFor(ws), own, tracker.status.Backlog, { by: 'manager' })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('refuses a member without Maintainer rights', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const lan = await addEmployee(ws, 'Lan')
    const member = sessionFor(ws, 'member', AccountRole.User)

    await expect(setTriage(member, own, { status: tracker.status.Backlog, owner: lan.person })).rejects.toMatchObject({ code: 'forbidden' })
  })
})
