/** The view's `status` condition: a single ref or a query selector (other operators don't occur on status). */
export type StatusFilter = string | { $in?: string[], $nin?: string[], $ne?: string }

/** Candidates the view's own status filter still allows, so replacing `status` keeps that filter. */
export function narrowStatuses<Id extends string> (candidates: Id[], filter: StatusFilter | undefined): Id[] {
  if (filter === undefined) return candidates
  if (typeof filter === 'string') return candidates.filter((status) => status === filter)
  const { $in: allowed, $nin: excluded, $ne: other } = filter
  return candidates.filter(
    (status) => (allowed === undefined || allowed.includes(status)) && !(excluded ?? []).includes(status) && status !== other
  )
}
