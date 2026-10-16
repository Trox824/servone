import type { Project } from '@hcengineering/tracker'
import { baseTypeOf } from '@servone/config'
import { WORKFLOW_APP_ALIAS, WORKFLOW_TYPE_ID } from './plugin'

export function issueAppPath (project: Pick<Project, 'type'>): [alias: string, special: string] | undefined {
  return baseTypeOf(project.type) === WORKFLOW_TYPE_ID ? [WORKFLOW_APP_ALIAS, 'items'] : undefined
}
