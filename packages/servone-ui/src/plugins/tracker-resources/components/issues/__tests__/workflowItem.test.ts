import type { IntlString } from '@hcengineering/platform'
import tracker from '@hcengineering/tracker'
import { str } from '../../../sprints/plugin'
import { isTrackerOnlyColumn, workflowColumnLabel } from '../workflowItem'

describe('isTrackerOnlyColumn', () => {
  const label = tracker.string.Project

  it('matches list keys by displayProps.key and Kanban keys as strings', () => {
    expect(isTrackerOnlyColumn({ key: '', displayProps: { key: 'milestone' } }, label)).toBe(true)
    expect(isTrackerOnlyColumn({ key: 'kind', displayProps: { key: 'kind' } }, label)).toBe(true)
    expect(isTrackerOnlyColumn('component', label)).toBe(true)
    expect(isTrackerOnlyColumn('subIssues', label)).toBe(false)
    expect(isTrackerOnlyColumn({ key: '', displayProps: { key: 'dueDate' } }, label)).toBe(false)
    expect(isTrackerOnlyColumn('labels', label)).toBe(false)
    expect(isTrackerOnlyColumn(undefined, label)).toBe(false)
  })

  it('matches the keyless Extensions column by label and keeps Sub-items', () => {
    expect(isTrackerOnlyColumn({ key: '' }, 'tracker:string:SubIssues' as IntlString)).toBe(false)
    expect(isTrackerOnlyColumn({ key: '' }, 'tracker:string:Extensions' as IntlString)).toBe(true)
    expect(isTrackerOnlyColumn({ key: '' }, label)).toBe(false)
  })
})

describe('workflowColumnLabel', () => {
  it('calls the Issue column Item and Sub-issues Sub-items', () => {
    expect(workflowColumnLabel(tracker.string.Issue)).toBe(str.Item)
    expect(workflowColumnLabel('tracker:string:SubIssues' as IntlString)).toBe(str.SubItems)
    expect(workflowColumnLabel(tracker.string.Project)).toBe(tracker.string.Project)
  })
})
