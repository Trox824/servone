import type { Space } from '@hcengineering/core'
import type { Asset, IntlString, Plugin, Resource } from '@hcengineering/platform'
import type { AnyComponent } from '@hcengineering/ui'
import { en, type StringKey } from './strings'

export const servoneTrackerId = 'servone-tracker' as Plugin

export const str = Object.fromEntries(
  Object.keys(en).map((k) => [k, `${servoneTrackerId}:string:${k}` as IntlString])
) as Record<StringKey, IntlString>

const icons = ['epic', 'story', 'task', 'bug', 'backlog', 'sprint', 'epics', 'report', 'triage', 'timeline', 'release', 'form', 'insights'] as const
export type IconKey = (typeof icons)[number]
export const icon = Object.fromEntries(icons.map((k) => [k, `${servoneTrackerId}:icon:${k}` as Asset])) as Record<
IconKey,
Asset
>
export const iconIds = icons

export const component = {
  Backlog: `${servoneTrackerId}:component:Backlog` as AnyComponent,
  ActiveSprint: `${servoneTrackerId}:component:ActiveSprint` as AnyComponent,
  Epics: `${servoneTrackerId}:component:Epics` as AnyComponent,
  SprintReport: `${servoneTrackerId}:component:SprintReport` as AnyComponent,
  Triage: `${servoneTrackerId}:component:Triage` as AnyComponent,
  Timeline: `${servoneTrackerId}:component:Timeline` as AnyComponent,
  Releases: `${servoneTrackerId}:component:Releases` as AnyComponent,
  Tabbed: `${servoneTrackerId}:component:Tabbed` as AnyComponent,
  TimelineView: `${servoneTrackerId}:component:TimelineView` as AnyComponent,
  CreateIssuePoints: `${servoneTrackerId}:component:CreateIssuePoints` as AnyComponent,
  CreateIssueForm: `${servoneTrackerId}:component:CreateIssueForm` as AnyComponent,
  Forms: `${servoneTrackerId}:component:Forms` as AnyComponent,
  Insights: `${servoneTrackerId}:component:Insights` as AnyComponent,
  ProjectWebhooks: `${servoneTrackerId}:component:ProjectWebhooks` as AnyComponent,
  ProjectStatuses: `${servoneTrackerId}:component:ProjectStatuses` as AnyComponent,
  ProjectCreateForm: `${servoneTrackerId}:component:ProjectCreateForm` as AnyComponent,
  ProjectMembers: `${servoneTrackerId}:component:ProjectMembers` as AnyComponent,
  ProjectHelpdesk: `${servoneTrackerId}:component:ProjectHelpdesk` as AnyComponent
}

/** Navigator `visibleIf`: true for a project set up for sprints (./setup.ts#isScrumProject). */
export const isScrumProjectFn = `${servoneTrackerId}:function:IsScrumProject` as Resource<(spaces: Space[]) => Promise<boolean>>

/** Navigator special ids, i.e. the last path segment of `/tracker/<project>/<id>`. */
export const specialIds = {
  backlog: 'backlog',
  activeSprint: 'active-sprint',
  epics: 'epics',
  reports: 'sprint-report',
  triage: 'triage',
  timeline: 'timeline',
  releases: 'releases',
  sprint: 'sprint',
  forms: 'forms',
  more: 'more',
  settings: 'settings'
}
