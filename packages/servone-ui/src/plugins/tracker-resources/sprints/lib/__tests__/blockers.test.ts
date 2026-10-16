import { blockedState, type BlockerInfo } from '../blockers'
import type { StatusKind } from '../types'

function issues (entries: Array<[string, StatusKind]>): Map<string, BlockerInfo> {
  return new Map(entries.map(([_id, status]) => [_id, { _id, status }]))
}

describe('blockedState', () => {
  it('blocks while the blocker is open, both ways', () => {
    const s = blockedState(
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'd', to: 'b' }
      ],
      issues([
        ['a', 'active'],
        ['b', 'todo'],
        ['c', 'unstarted'],
        ['d', 'done']
      ])
    )
    expect(s.blockedBy).toEqual(new Map([['b', ['a']], ['c', ['a']]]))
    expect(s.blocking).toEqual(new Map([['a', ['b', 'c']]]))
  })

  it('ignores done or canceled blocked issues, self links and duplicates from both sources', () => {
    const s = blockedState(
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
        { from: 'a', to: 'a' },
        { from: 'a', to: 'c' }
      ],
      issues([
        ['a', 'todo'],
        ['b', 'todo'],
        ['c', 'canceled']
      ])
    )
    expect(s.blockedBy).toEqual(new Map([['b', ['a']]]))
  })

  it('counts an unknown blocker as open and an unknown blocked issue as not shown', () => {
    const s = blockedState(
      [
        { from: 'x', to: 'b' },
        { from: 'b', to: 'y' }
      ],
      issues([['b', 'todo']])
    )
    expect(s.blockedBy).toEqual(new Map([['b', ['x']]]))
    expect(s.blocking).toEqual(new Map([['x', ['b']]]))
  })
})
