import type { AccountUuid, Ref, Space } from '@hcengineering/core'
import type { IntlString, Resource } from '@hcengineering/platform'
import type { AnyComponent } from '@hcengineering/ui'
import type { Department } from '@hcengineering/hr'
import tracker, { type IssueStatus, type Project } from '@hcengineering/tracker'
import { extendNavModel, groupWorkflows, isPageShown, isTrackerProject, isWorkflowType, shownPage, type WorkflowProject } from '../nav'
import { WORKFLOW_TYPE_ID } from '../plugin'

describe('extendNavModel', () => {
  it('opens Quy trình on My work', () => {
    const model = extendNavModel({ alias: 'approval' }, { spaces: [], specials: [] })
    expect(model?.specials).toEqual([
      { id: 'my-work', position: 'top', label: 'servone-workflow:string:MyWork', component: 'servone-workflow:component:MyWork' }
    ])
  })

  it('lists workflows with their Công việc, Hộp đến and Cài đặt pages', () => {
    const model = extendNavModel({ alias: 'approval' }, { spaces: [], specials: [] })
    expect(model?.hideStarred).toBe(true)
    expect(model?.groups?.map((group) => [group.id, group.component])).toEqual([['workflows', 'servone-workflow:component:WorkflowNav']])
    const pages = model?.groups?.[0].specials ?? []
    expect(pages.map((page) => [page.id, page.component])).toEqual([
      ['items', 'servone-workflow:component:WorkflowIssues'],
      ['intake', 'servone-workflow:component:WorkflowIssues'],
      ['settings', 'servone-workflow:component:WorkflowSettings']
    ])
    expect(pages[0].componentProps?.baseQuery).toEqual({ servoneArchivedOn: { $exists: false } })
    expect([pages[0].componentProps?.emptyActionLabel, pages[1].componentProps?.emptyActionLabel]).toEqual([
      'servone-workflow:string:NewItem',
      undefined
    ])
    expect(pages[1].componentProps?.baseQuery).toEqual({ assignee: null, servoneArchivedOn: { $exists: false } })
    expect(pages[1].componentProps?.config.map(([mode]: [string]) => mode)).toEqual(['all'])
    expect(pages[2].componentProps?.tabs.map((tab: { component: string }) => tab.component)).toEqual([
      'servone-tracker:component:ProjectStatuses',
      'servone-tracker:component:ProjectMembers',
      'servone-tracker:component:ProjectCreateForm',
      'servone-tracker:component:ProjectHelpdesk'
    ])
  })

  it('hides workflow projects from Tracker and keeps its other specials', () => {
    const issues = { id: 'issues', label: 'Issues' as IntlString, component: 'tracker:component:Issues' as AnyComponent }
    const allProjects = { id: 'all-projects', label: 'All projects' as IntlString, component: 'workbench:component:SpecialView' as AnyComponent }
    const model = extendNavModel(
      { alias: 'tracker' },
      {
        specials: [allProjects],
        spaces: [{ id: 'projects', spaceClass: tracker.class.Project, visibleIf: 'tracker:function:IsProjectJoined' as Resource<(space: Space) => Promise<boolean>>, specials: [issues] }]
      }
    )
    expect(model?.spaces[0].visibleIf).toBe('servone-workflow:function:IsTrackerProject')
    expect(model?.spaces[0].specials).toEqual([issues])
    expect(model?.specials).toEqual([{ ...allProjects, queryBuilder: 'servone-workflow:function:TrackerProjectsQuery' }])
  })

  it('leaves other apps untouched', () => {
    const model = { spaces: [], specials: [] }
    expect(extendNavModel({ alias: 'contact' }, model)).toBe(model)
  })
})

describe('isPageShown', () => {
  it('shows Hộp đến only with triage and the SLA tab on every workflow', () => {
    const blank = {}
    expect(['items', 'intake', 'settings', 'statuses', 'sla'].filter((id) => isPageShown(id, blank))).toEqual(['items', 'settings', 'statuses', 'sla'])
    expect(isPageShown('intake', { servoneTriageStatus: 'status1' as Ref<IssueStatus> })).toBe(true)
  })
})

describe('shownPage', () => {
  it('sends a hidden page to Công việc and keeps a shown one', () => {
    expect(shownPage('intake', {})).toBe('items')
    expect(shownPage('intake', { servoneTriageStatus: 'status1' as Ref<IssueStatus> })).toBe('intake')
    expect(shownPage('settings', {})).toBe('settings')
  })
})

describe('isWorkflowType', () => {
  it('is true for the Workflow type and its per-project copies only', () => {
    expect(isWorkflowType('servone:projectType:Workflow')).toBe(true)
    expect(isWorkflowType('servone:projectType:Workflow:of:proj1')).toBe(true)
    expect(isWorkflowType('servone:projectType:Scrum:of:proj1')).toBe(false)
    expect(isWorkflowType('tracker:ids:ClassingProjectType')).toBe(false)
  })
})

describe('isTrackerProject', () => {
  it('keeps joined non-workflow projects only', () => {
    const me = 'me' as AccountUuid
    expect(isTrackerProject({ type: tracker.ids.ClassingProjectType, members: [me] }, me)).toBe(true)
    expect(isTrackerProject({ type: tracker.ids.ClassingProjectType, members: [] }, me)).toBe(false)
    expect(isTrackerProject({ type: `${WORKFLOW_TYPE_ID}:of:p1` as Project['type'], members: [me] }, me)).toBe(false)
  })
})

describe('groupWorkflows', () => {
  const workflow = (name: string, servoneDepartment?: string, extra: Partial<Project> = {}): WorkflowProject => ({
    _id: name as Ref<Project>,
    name,
    type: WORKFLOW_TYPE_ID,
    archived: false,
    servoneDepartment: servoneDepartment as Ref<Department> | undefined,
    ...extra
  })
  const sales = { _id: 'sales' as Ref<Department>, name: 'Kinh doanh' }
  const hr = { _id: 'hr' as Ref<Department>, name: 'Hành chính' }

  it('groups live workflows by department name, unknown departments last', () => {
    const groups = groupWorkflows(
      [
        workflow('Mua hàng', 'sales'),
        workflow('Hợp đồng', 'sales'),
        workflow('Tuyển dụng', 'hr'),
        workflow('Orphan', 'deleted'),
        workflow('Loose'),
        workflow('Old', 'sales', { archived: true }),
        workflow('Dev', 'sales', { type: tracker.ids.ClassingProjectType })
      ],
      [sales, hr]
    )
    expect(groups.map((group) => [group.department?.name, group.workflows.map((project) => project.name)])).toEqual([
      ['Hành chính', ['Tuyển dụng']],
      ['Kinh doanh', ['Hợp đồng', 'Mua hàng']],
      [undefined, ['Loose', 'Orphan']]
    ])
  })
})
