import type { Ref } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { type Issue, type IssueStatus } from '@hcengineering/tracker'
import type { SetupClient } from '../workflows/setup'

const STARTER_ID_PREFIX = 'servone:starter:'

export const starterIssueId = (key: string): Ref<Issue> => `${STARTER_ID_PREFIX}${key}` as Ref<Issue>
export const isStarterId = (id: string): boolean => id.startsWith(STARTER_ID_PREFIX)
export const starterKeyOf = (id: Ref<Issue>): string => id.slice(STARTER_ID_PREFIX.length)

export async function isDoneStatus (client: SetupClient, status: Ref<IssueStatus>): Promise<boolean> {
  return (await client.findOne(tracker.class.IssueStatus, { _id: status }))?.category === task.statusCategory.Won
}
