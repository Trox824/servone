import { narrowStatuses } from '../statuses'

describe('narrowStatuses', () => {
  const open = ['backlog', 'todo', 'doing']

  it('keeps every candidate when the view does not filter on status', () => {
    expect(narrowStatuses(open, undefined)).toEqual(open)
  })

  it('keeps only the statuses the view allows', () => {
    expect(narrowStatuses(open, { $in: ['todo', 'done'] })).toEqual(['todo'])
    expect(narrowStatuses(open, 'doing')).toEqual(['doing'])
  })

  it('drops the statuses the view excludes', () => {
    expect(narrowStatuses(open, { $nin: ['backlog'] })).toEqual(['todo', 'doing'])
    expect(narrowStatuses(open, { $ne: 'todo' })).toEqual(['backlog', 'doing'])
  })

  it('leaves nothing when the view shows only done work', () => {
    expect(narrowStatuses(open, { $in: ['done'] })).toEqual([])
  })
})
