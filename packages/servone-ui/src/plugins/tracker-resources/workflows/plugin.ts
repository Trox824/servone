import type { Doc, DocumentQuery, Space } from '@hcengineering/core'
import type { Asset, IntlString, Plugin, Resource } from '@hcengineering/platform'
import type { Project } from '@hcengineering/tracker'
import type { AnyComponent } from '@hcengineering/ui'
import { en, type StringKey } from './strings'

export const workflowId = 'servone-workflow' as Plugin
export const WORKFLOW_APP_ALIAS = 'approval'
export const LEGACY_WORKFLOW_APP_ALIAS = 'quy-trinh'
export const WORKFLOW_TYPE_ID = 'servone:projectType:Workflow' as Project['type']

export const str = Object.fromEntries(
  Object.keys(en).map((key) => [key, `${workflowId}:string:${key}` as IntlString])
) as Record<StringKey, IntlString>

export const workflowIcon = `${workflowId}:icon:workflow` as Asset

export const component = {
  MyWork: `${workflowId}:component:MyWork` as AnyComponent,
  WorkflowNav: `${workflowId}:component:WorkflowNav` as AnyComponent,
  WorkflowIssues: `${workflowId}:component:WorkflowIssues` as AnyComponent,
  WorkflowSettings: `${workflowId}:component:WorkflowSettings` as AnyComponent
}

export const fn = {
  IsTrackerProject: `${workflowId}:function:IsTrackerProject` as Resource<(space: Space) => Promise<boolean>>,
  TrackerProjectsQuery: `${workflowId}:function:TrackerProjectsQuery` as Resource<() => Promise<DocumentQuery<Doc>>>
}
