import type { Class, Doc, Hierarchy, Ref } from '@hcengineering/core'
import tracker from '@hcengineering/tracker'
import type { KeyFilter } from '@hcengineering/view'
import { str } from './plugin'

const GITHUB_ISSUE_MIXIN = 'github:mixin:GithubIssue'
const EPIC_KEY = 'attachedTo'
const DUE_DATE_KEY = 'dueDate'
const TRACKER_ONLY_KEYS = ['kind', 'component', 'milestone', EPIC_KEY]

export function adjustIssueFilters (
  hierarchy: Hierarchy,
  _class: Ref<Class<Doc>>,
  filters: KeyFilter[],
  buildFilter: (key: string) => KeyFilter | undefined,
  isWorkflow: boolean
): KeyFilter[] {
  if (_class !== tracker.class.Issue) return filters
  const adjusted = filters.filter((filter) => filter._class !== GITHUB_ISSUE_MIXIN)
  for (const key of [EPIC_KEY, DUE_DATE_KEY]) {
    if (adjusted.some((filter) => filter.key === key)) continue
    if (hierarchy.findAttribute(_class, key) === undefined) continue
    const added = buildFilter(key)
    if (added === undefined) continue
    adjusted.push(key === EPIC_KEY ? { ...added, label: str.Epic, group: 'top' } : added)
  }
  return isWorkflow ? adjusted.filter((filter) => !TRACKER_ONLY_KEYS.includes(filter.key)) : adjusted
}
