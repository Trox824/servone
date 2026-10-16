import type { Employee } from '@hcengineering/contact'
import core, { type Class, type Ref, type Status, type StatusCategory } from '@hcengineering/core'
import task, { type ProjectStatus } from '@hcengineering/task'
import tracker, { type IssueStatus, type Project } from '@hcengineering/tracker'
import { type ApproverRule, statusApproval } from '@servone/approvals/src/gate'
import type { ConfigSession } from '../client'
import { ConfigError } from '../errors'

// Board column order.
export const CATEGORIES = [
  task.statusCategory.UnStarted,
  task.statusCategory.ToDo,
  task.statusCategory.Active,
  task.statusCategory.Won,
  task.statusCategory.Lost
]

// Set together by setTriage; the status is always a Backlog-category status of the project.
export interface TriageProject extends Project {
  servoneTriageStatus?: Ref<IssueStatus>
  servoneTriageOwner?: Ref<Employee>
}
export const triageProjectClass: Ref<Class<TriageProject>> = tracker.class.Project

export interface ProjectStatusRow {
  status: Ref<Status>
  name: string
  color?: ProjectStatus['color']
  isDefault: boolean
  approval?: ApproverRule
  issueCount: number
}

export interface ProjectStatusGroup {
  category: Ref<StatusCategory>
  isTriage: boolean
  rows: ProjectStatusRow[]
}

export async function projectStatusGroups (
  session: ConfigSession,
  projectId: Ref<Project>
): Promise<ProjectStatusGroup[]> {
  const [project] = await session.client.findAll(triageProjectClass, { _id: projectId })
  if (project === undefined) throw new ConfigError('not-found', 'Không tìm thấy dự án hoặc quy trình')
  const [type] = await session.client.findAll(task.class.ProjectType, { _id: project.type })
  if (type === undefined) throw new ConfigError('not-found', 'Không tìm thấy bộ trạng thái')
  const statuses = await session.client.findAll(core.class.Status, { _id: { $in: type.statuses.map((it) => it._id) } })
  const issues = await session.client.findAll(
    tracker.class.Issue,
    { space: project._id },
    { projection: { status: 1 } }
  )
  const counts = new Map<Ref<Status>, number>()
  for (const issue of issues) counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1)
  const groups = CATEGORIES.map((category): ProjectStatusGroup => ({ category, isTriage: false, rows: [] }))
  const triage: ProjectStatusGroup = { category: task.statusCategory.UnStarted, isTriage: true, rows: [] }
  const seen = new Set<Ref<Status>>()
  for (const entry of type.statuses) {
    const status = statuses.find((it) => it._id === entry._id)
    if (status === undefined || seen.has(status._id)) continue
    const group = status._id === project.servoneTriageStatus ? triage : groups.find((it) => it.category === status.category)
    if (group === undefined) continue
    seen.add(status._id)
    group.rows.push({
      status: status._id,
      name: status.name,
      color: entry.color ?? status.color,
      isDefault: project.defaultIssueStatus === status._id,
      approval: statusApproval(type, status._id),
      issueCount: counts.get(status._id) ?? 0
    })
  }
  return triage.rows.length > 0 ? [triage, ...groups] : groups
}
