import type { Client, Doc, Hierarchy, IdMap, Ref } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import type { TaskType } from '@hcengineering/task'
import tracker, { type Issue } from '@hcengineering/tracker'
import type { Action, BuildModelKey } from '@hcengineering/view'
import { str } from '../../sprints/plugin'
import { isWorkflowType } from '../../workflows/nav'

export function isWorkflowKind (kind: Ref<TaskType> | undefined, taskTypes: IdMap<TaskType>): boolean {
  const projectType = kind !== undefined ? taskTypes.get(kind)?.parent : undefined
  return projectType !== undefined && isWorkflowType(projectType)
}

function isIssue (doc: Doc, hierarchy: Hierarchy): doc is Issue {
  return hierarchy.isDerived(doc._class, tracker.class.Issue)
}

function isWorkflowItem (doc: Doc, client: Client): boolean {
  if (!isIssue(doc, client.getHierarchy())) return false
  const projectType = client.getModel().findObject(doc.kind)?.parent
  return projectType !== undefined && isWorkflowType(projectType)
}

const trackerOnlyActions: Array<Ref<Action>> = [tracker.action.SetComponent, tracker.action.SetMilestone]
const itemActionLabels = new Map<Ref<Action>, IntlString>([
  [tracker.action.CopyIssueId, str.CopyItemId],
  [tracker.action.CopyIssueTitle, str.CopyItemTitle],
  [tracker.action.CopyIssueLink, str.CopyItemLink]
])

export function workflowItemMenuActions (target: Doc | Doc[], actions: Action[], client: Client): Action[] {
  const docs = Array.isArray(target) ? target : [target]
  if (docs.length === 0 || !docs.every((doc) => isWorkflowItem(doc, client))) return actions
  return (
    actions
      .filter((action) => !trackerOnlyActions.includes(action._id) && action.icon !== tracker.icon.TimeReport)
      .map((action) => {
        const label = itemActionLabels.get(action._id)
        return label === undefined ? action : { ...action, label }
      })
  )
}

const trackerOnlyColumns = ['kind', 'milestone', 'component', 'estimation']
const trackerOnlyLabels = ['tracker:string:Extensions']

export function isTrackerOnlyColumn (column: string | BuildModelKey | undefined, label: IntlString): boolean {
  if (trackerOnlyLabels.includes(label)) return true
  const key = typeof column === 'string' ? column : (column?.displayProps?.key ?? column?.key)
  return key !== undefined && trackerOnlyColumns.includes(key)
}

const itemColumnLabels = new Map<IntlString, IntlString>([
  [tracker.string.Issue, str.Item],
  ['tracker:string:SubIssues' as IntlString, str.SubItems]
])

export function workflowColumnLabel (label: IntlString): IntlString {
  return itemColumnLabels.get(label) ?? label
}
