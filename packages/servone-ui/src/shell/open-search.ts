import { getResource, type Resource } from '@hcengineering/platform'
import type { Doc } from '@hcengineering/core'

type ShowActionsFn = (doc: Doc | Doc[] | undefined, evt: Event) => void
const showActionsId = 'view:actionImpl:ShowActions' as Resource<ShowActionsFn>

export async function openSearch (evt: Event): Promise<void> {
  const showActions = await getResource(showActionsId)
  showActions(undefined, evt)
}
