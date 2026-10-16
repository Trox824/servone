import { deadlineItems } from '../deadlines'

const issue = (id: string, fields: Partial<{ dueDate: number | null, subIssues: number, status: string }> = {}) => ({
  _id: id,
  title: `Step ${id}`,
  dueDate: new Date(2026, 10, 2, 23, 59, 59, 999).getTime(),
  subIssues: 0,
  status: 'open',
  ...fields
})

describe('deadlineItems', () => {
  const isClosed = (status: string): boolean => status === 'done'

  it('lays a due item out as an all-day card on its local due day', () => {
    expect(deadlineItems([issue('a')], isClosed, 'vi')).toEqual([
      {
        _id: 'a',
        title: 'Hạn: Step a',
        allDay: true,
        date: Date.UTC(2026, 10, 2),
        dueDate: Date.UTC(2026, 10, 2, 23, 59, 59, 999)
      }
    ])
  })

  it('leaves out undated, finished and parent items', () => {
    const shown = deadlineItems(
      [issue('a', { dueDate: null }), issue('b', { status: 'done' }), issue('c', { subIssues: 3 }), issue('d')],
      isClosed,
      'en'
    )
    expect(shown.map((item) => [item._id, item.title])).toEqual([['d', 'Due: Step d']])
  })
})
