import { icon } from '../../plugin'
import { SCRUM_STATUSES, TASK_TYPE_IDS, TASK_TYPE_ORDER, taskTypeIcon } from '../../scrum-spec'

describe('scrum spec', () => {
  it('names the same icons the app registers', () => {
    for (const key of TASK_TYPE_ORDER) expect(taskTypeIcon(key)).toBe(icon[key])
  })

  it('lists every task type once, Task first', () => {
    expect([...TASK_TYPE_ORDER].sort()).toEqual(Object.keys(TASK_TYPE_IDS).sort())
    expect(TASK_TYPE_ORDER[0]).toBe('task')
  })

  it('keeps the classic status names', () => {
    expect(SCRUM_STATUSES.map((s) => s.name)).toEqual(['Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Canceled'])
  })
})
