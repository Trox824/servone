import type { AccountUuid, Class, Ref } from '@hcengineering/core'
import type { Department } from '@hcengineering/hr'
import notification from '@hcengineering/notification'
import type { IntlString } from '@hcengineering/platform'
import setting from '@hcengineering/setting'
import tracker, { type IssueStatus, type Project } from '@hcengineering/tracker'
import type { AnyComponent } from '@hcengineering/ui'
import type { Application, NavigatorModel, SpecialNavModel } from '@hcengineering/workbench'
import { baseTypeOf } from '@servone/config'
import { ARCHIVED_ON } from '@servone/notify-rules'
import { str as helpdeskStr } from '../helpdesk/strings'
import { component, fn, str, workflowIcon, WORKFLOW_APP_ALIAS, WORKFLOW_TYPE_ID } from './plugin'

export function isWorkflowType (type: string): boolean {
  return baseTypeOf(type) === WORKFLOW_TYPE_ID
}

export function isTrackerProject (project: Pick<Project, 'type' | 'members'>, account: AccountUuid): boolean {
  return project.members.includes(account) && !isWorkflowType(project.type)
}

export type WorkflowProject = Pick<Project, '_id' | 'name' | 'type' | 'archived'> & { servoneDepartment?: Ref<Department> }
type DepartmentName = Pick<Department, '_id' | 'name'>

export interface WorkflowPagesProject extends Project {
  servoneTriageStatus?: Ref<IssueStatus>
}
export const workflowPagesProjectClass: Ref<Class<WorkflowPagesProject>> = tracker.class.Project

export function isPageShown (id: string, project: Pick<WorkflowPagesProject, 'servoneTriageStatus'>): boolean {
  return id !== 'intake' || project.servoneTriageStatus !== undefined
}

export function shownPage (page: string, project: Pick<WorkflowPagesProject, 'servoneTriageStatus'>): string {
  return isPageShown(page, project) ? page : 'items'
}

export function pageTitle (workflow: string, page: string): string {
  return `${workflow} › ${page}`
}

export interface WorkflowGroup<P extends WorkflowProject, D extends DepartmentName> {
  department: D | undefined
  workflows: P[]
}

export function groupWorkflows<P extends WorkflowProject, D extends DepartmentName> (
  projects: P[],
  departments: D[]
): Array<WorkflowGroup<P, D>> {
  const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name)
  const live = projects.filter((project) => !project.archived && isWorkflowType(project.type)).sort(byName)
  const groups = [...departments].sort(byName).map((department) => ({
    department,
    workflows: live.filter((project) => project.servoneDepartment === department._id)
  }))
  const known = new Set(departments.map((department) => department._id))
  const orphans = live.filter(
    (project) => project.servoneDepartment === undefined || !known.has(project.servoneDepartment)
  )
  return [...groups, { department: undefined, workflows: orphans }].filter((group) => group.workflows.length > 0)
}

export const ISSUES = 'tracker:component:Issues' as AnyComponent
const ALL = 'tracker:string:All' as IntlString
const ACTIVE = 'tracker:string:Active' as IntlString
export const TABBED = 'servone-tracker:component:Tabbed' as AnyComponent
const SETTINGS_TABS = [
  { id: 'statuses', label: str.Statuses, component: 'servone-tracker:component:ProjectStatuses' },
  { id: 'members', label: str.Members, component: 'servone-tracker:component:ProjectMembers' },
  { id: 'create-form', label: str.CreateForm, component: 'servone-tracker:component:ProjectCreateForm' },
  { id: 'sla', label: helpdeskStr.SlaAutomation, component: 'servone-tracker:component:ProjectHelpdesk' }
]
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export const UNARCHIVED = { [ARCHIVED_ON]: { $exists: false } }

const workflowPages: SpecialNavModel[] = [
  {
    id: 'items',
    label: str.Items,
    icon: tracker.icon.Issues,
    component: component.WorkflowIssues,
    componentProps: {
      title: str.Items,
      icon: workflowIcon,
      baseQuery: UNARCHIVED,
      config: [['all', ALL, {}], ['active', ACTIVE, {}]],
      emptyLabel: str.NoItems,
      emptyActionLabel: str.NewItem
    }
  },
  {
    id: 'intake',
    label: str.Intake,
    icon: notification.icon.Inbox,
    component: component.WorkflowIssues,
    componentProps: {
      title: str.Intake,
      icon: workflowIcon,
      baseQuery: { assignee: null, ...UNARCHIVED },
      config: [['all', ALL, {}]],
      emptyLabel: str.IntakeEmpty
    }
  },
  {
    id: 'settings',
    label: str.Settings,
    icon: setting.icon.Setting,
    component: component.WorkflowSettings,
    componentProps: { title: str.Settings, tabs: SETTINGS_TABS }
  }
]

function hideWorkflows (model: NavigatorModel): NavigatorModel {
  return {
    ...model,
    spaces: model.spaces.map((space) => (space.id === 'projects' ? { ...space, visibleIf: fn.IsTrackerProject } : space)),
    specials: model.specials?.map((special) =>
      special.id === 'all-projects' ? { ...special, queryBuilder: fn.TrackerProjectsQuery } : special
    )
  }
}

export function extendNavModel (app: Pick<Application, 'alias'>, model: NavigatorModel | undefined): NavigatorModel | undefined {
  if (app.alias === 'tracker' && model !== undefined) return hideWorkflows(model)
  if (app.alias !== WORKFLOW_APP_ALIAS) return model
  return {
    spaces: [],
    ...model,
    specials: [{ id: 'my-work', position: 'top', label: str.MyWork, component: component.MyWork }],
    groups: [{ id: 'workflows', groupByClass: tracker.class.Project, component: component.WorkflowNav, specials: workflowPages }],
    hideStarred: true
  }
}
