import type { Issue } from '@hcengineering/tracker'
import { fold } from '../../../lib/fold'
import { issuePoints } from './schema'

export type QuickMode = 'all' | 'mine' | 'unpointed' | 'blocked'

export interface IssueFilter {
  search: string
  mode: QuickMode
  /** Epic issue id, or 'all'. Huly's filter menu has no epic (parent) filter. */
  epic: string
  /** Ids matching the Huly filter bar, or undefined while no filter is set. */
  match: Set<string> | undefined
}

export const NO_FILTER: IssueFilter = { search: '', mode: 'all', epic: 'all', match: undefined }

export function isFiltered (f: IssueFilter): boolean {
  return f.search.trim() !== '' || f.mode !== 'all' || f.epic !== 'all' || f.match !== undefined
}

export function matchesFilter (issue: Issue, f: IssueFilter, me: string | undefined, blocked?: Set<string>): boolean {
  if (f.match !== undefined && !f.match.has(issue._id)) return false
  if (f.epic !== 'all' && issue.attachedTo !== f.epic) return false
  if (f.mode === 'mine' && (me === undefined || issue.assignee !== me)) return false
  if (f.mode === 'unpointed' && issuePoints(issue) !== null) return false
  if (f.mode === 'blocked' && blocked?.has(issue._id) !== true) return false
  const q = fold(f.search.trim())
  if (q !== '' && !fold(`${issue.identifier} ${issue.title}`).includes(q)) return false
  return true
}

/** The page header's search box (a Huly SearchInput in the header's search slot). */
export function focusHeaderSearch (): void {
  document.querySelector<HTMLInputElement>('.hulyHeader-container label input')?.focus()
}
