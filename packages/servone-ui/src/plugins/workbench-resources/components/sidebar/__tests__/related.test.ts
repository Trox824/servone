import { groupRelated, openTarget, type RelatedRow } from '../related'

const ws = ['workbench', 'acme']
const noop = (): void => {}
const row = (key: string, kind: RelatedRow['kind']): RelatedRow => ({ key, kind, title: key, open: noop })

describe('openTarget', () => {
  it('uses the open panel first', () => {
    expect(openTarget({ _id: 'issue-1', _class: 'tracker:class:Issue' }, { path: [...ws, 'mail', 'thread-1'] }))
      .toEqual({ kind: 'doc', _id: 'issue-1', _class: 'tracker:class:Issue' })
  })

  it('reads the mail thread from the path', () => {
    expect(openTarget(undefined, { path: [...ws, 'mail', 'thread-1'] })).toEqual({ kind: 'mail', thread: 'thread-1' })
    expect(openTarget(undefined, { path: [...ws, 'mail'] })).toBeUndefined()
  })

  it('reads the meeting from the query', () => {
    expect(openTarget(undefined, { path: [...ws, 'love'], query: { meeting: 'event-1' } })).toEqual({ kind: 'meeting', event: 'event-1' })
    expect(openTarget(undefined, { path: [...ws, 'love'], query: { meeting: null } })).toBeUndefined()
  })

  it('has nothing for an app page', () => {
    expect(openTarget(undefined, { path: [...ws, 'tracker'] })).toBeUndefined()
  })
})

describe('groupRelated', () => {
  it('orders groups and lists a row once', () => {
    const groups = groupRelated([row('t1', 'task'), row('m1', 'meeting'), row('t1', 'task'), row('f1', 'file')])
    expect(groups.map((g) => [g.kind, g.rows.map((r) => r.key)])).toEqual([
      ['meeting', ['m1']],
      ['task', ['t1']],
      ['file', ['f1']]
    ])
  })
})
