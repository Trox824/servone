import { focusAppOrder } from '../app-order'
import { countDone, creatorItems, personalItems } from '../items'

describe('creatorItems', () => {
  it('orders known keys first, keeps unknown ones last, drops non-starters', () => {
    const items = creatorItems([
      { id: 'servone:starter:meeting', title: 'M', isDone: true },
      { id: 'servone:starter:old-task', title: 'Old', isDone: false },
      { id: 'other:1', title: 'X', isDone: false },
      { id: 'servone:starter:invite', title: 'I', isDone: false }
    ])
    expect(items.map((it) => it.key)).toEqual(['invite', 'meeting', 'old-task'])
    expect(countDone(items)).toBe(1)
  })
})

describe('personalItems', () => {
  const base = { hasPhoto: false, hasPosted: true, hasAssigned: false, hasOpenedAssigned: false }

  it('hides the assigned item until a task is assigned', () => {
    expect(personalItems(base).map((it) => it.key)).toEqual(['photo', 'hello'])
    expect(personalItems({ ...base, hasAssigned: true }).map((it) => it.key)).toEqual(['photo', 'hello', 'assigned'])
  })
})

describe('focusAppOrder', () => {
  const apps = ['tracker', 'chunter', 'time', 'drive'].map((alias) => ({ _id: `id-${alias}`, alias }))

  it('lists focus apps in order and skips missing ones', () => {
    expect(focusAppOrder(apps, 'both')).toEqual(['id-chunter', 'id-tracker', 'id-time'])
    expect(focusAppOrder(apps, 'projects')).toEqual(['id-tracker', 'id-chunter', 'id-time'])
  })
})
