import { AccountRole, type Ref } from '@hcengineering/core'
import type { Person } from '@hcengineering/contact'
import task from '@hcengineering/task'
import tracker, { type IssueStatus, type Project } from '@hcengineering/tracker'
import { type ApproverRule, statusApproval } from '@servone/approvals/src/gate'
import { moveStatus, renameStatus, setStatusApproval } from '../project-statuses/edit'
import { projectStatusGroups } from '../project-statuses/read'
import { createWorkspace, type MemoryWorkspace, sessionFor } from './harness'
import { addBugKind, addProject, readProject } from './project-harness'

const PERSON_RULE: ApproverRule = { by: 'person', person: 'person-an' as Ref<Person> }

async function approvals (ws: MemoryWorkspace, project: Ref<Project>): Promise<Record<string, ApproverRule | undefined>> {
  const groups = await projectStatusGroups(sessionFor(ws), project)
  return Object.fromEntries(groups.flatMap((group) => group.rows.map((row) => [row.name, row.approval])))
}

// statusApproval reads the first matching entry, so each entry is checked on its own.
async function entryApprovals (ws: MemoryWorkspace, project: Ref<Project>, status: Ref<IssueStatus>): Promise<Array<ApproverRule | undefined>> {
  const { type } = await readProject(ws, project)
  const [projectType] = await ws.client.findAll(task.class.ProjectType, { _id: type })
  return projectType.statuses
    .filter((entry) => entry._id === status)
    .map((entry) => statusApproval({ ...projectType, statuses: [entry] }, status))
}

describe('setStatusApproval', () => {
  it('shows the approver on the row until approval is turned off', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const other = await addProject(ws, 'OTHER')

    await setStatusApproval(sessionFor(ws), own, tracker.status.InProgress, PERSON_RULE)

    expect((await approvals(ws, own))['In Progress']).toEqual(PERSON_RULE)
    expect((await approvals(ws, other))['In Progress']).toBeUndefined()

    await setStatusApproval(sessionFor(ws), own, tracker.status.InProgress, undefined)

    expect((await approvals(ws, own))['In Progress']).toBeUndefined()
  })
  it('marks the status for every task type, and the mark survives a reorder and a forking rename', async () => {
    const ws = createWorkspace()
    await addBugKind(ws)
    const own = await addProject(ws, 'OWN')
    await addProject(ws, 'OTHER')

    await setStatusApproval(sessionFor(ws), own, tracker.status.InProgress, PERSON_RULE)
    expect(await entryApprovals(ws, own, tracker.status.InProgress)).toEqual([PERSON_RULE, PERSON_RULE])

    await moveStatus(sessionFor(ws), own, tracker.status.InProgress, 0)
    expect(await entryApprovals(ws, own, tracker.status.InProgress)).toEqual([PERSON_RULE, PERSON_RULE])

    await renameStatus(sessionFor(ws), own, tracker.status.InProgress, 'Chờ duyệt')
    expect((await approvals(ws, own))['Chờ duyệt']).toEqual(PERSON_RULE)
    const [renamed] = await ws.client.findAll(tracker.class.IssueStatus, { name: 'Chờ duyệt' })
    expect(await entryApprovals(ws, own, renamed._id)).toEqual([PERSON_RULE, PERSON_RULE])
  })

  it('refuses Done and Canceled statuses', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')

    await expect(setStatusApproval(sessionFor(ws), own, tracker.status.Done, { by: 'manager' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(setStatusApproval(sessionFor(ws), own, tracker.status.Canceled, { by: 'manager' })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('refuses a member without Maintainer rights', async () => {
    const ws = createWorkspace()
    const own = await addProject(ws, 'OWN')
    const member = sessionFor(ws, 'member', AccountRole.User)

    await expect(setStatusApproval(member, own, tracker.status.InProgress, { by: 'manager' })).rejects.toMatchObject({ code: 'forbidden' })
    expect((await approvals(ws, own))['In Progress']).toBeUndefined()
  })
})
