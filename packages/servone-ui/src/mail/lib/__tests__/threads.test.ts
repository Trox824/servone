import type { Ref } from '@hcengineering/core'
import type { MailFolderCard, MailThreadCard } from '@servone/mail'
import { actionTargets, moveCursor, nextAfterRemoval, pickRange, togglePicked, visibleThreads, type Selection } from '../threads'
import { thread as buildThread } from './builders'

function thread (id: string, folders: string[], at: number): MailThreadCard {
  return buildThread({
    _id: id as Ref<MailThreadCard>,
    mailFolders: folders.map((folder) => folder as Ref<MailFolderCard>),
    mailLastMessageAt: at
  })
}

const asThread = (id: string): Ref<MailThreadCard> => id as Ref<MailThreadCard>

describe('visibleThreads', () => {
  it('lists threads of the folder in query order, without hidden ones', () => {
    const threads = [thread('b', ['inbox', 'label'], 3), thread('c', ['sent'], 2), thread('d', ['inbox'], 2), thread('a', ['inbox'], 1)]
    expect(visibleThreads(threads, 'inbox' as Ref<MailFolderCard>, new Set([asThread('d')])).map((it) => it._id)).toEqual(['b', 'a'])
  })
})

describe('moveCursor', () => {
  it('moves the cursor with j/k and stops at the ends', () => {
    const threads = [thread('a', ['inbox'], 3), thread('b', ['inbox'], 2)]
    const start: Selection = { cursor: undefined, picked: new Set() }
    const first = moveCursor(threads, start, 1)
    expect(first.cursor).toBe('a')
    expect(moveCursor(threads, first, -1).cursor).toBe('a')
    expect(moveCursor(threads, moveCursor(threads, first, 1), 1).cursor).toBe('b')
  })
})

describe('togglePicked', () => {
  it('adds and removes a thread from the picked set', () => {
    const selection: Selection = { cursor: undefined, picked: new Set() }
    const picked = togglePicked(selection, asThread('a'))
    expect([...picked.picked]).toEqual(['a'])
    expect([...togglePicked(picked, asThread('a')).picked]).toEqual([])
  })
})

describe('actionTargets', () => {
  it('acts on picked threads, falling back to the cursor', () => {
    expect(actionTargets({ cursor: asThread('a'), picked: new Set() })).toEqual(['a'])
    expect(actionTargets({ cursor: asThread('a'), picked: new Set([asThread('b'), asThread('c')]) })).toEqual(['b', 'c'])
    expect(actionTargets({ cursor: undefined, picked: new Set() })).toEqual([])
  })
})

describe('nextAfterRemoval', () => {
  it('opens the next older thread after the open one is archived, else the newer one', () => {
    const threads = [thread('a', ['inbox'], 3), thread('b', ['inbox'], 2), thread('c', ['inbox'], 1)]
    expect(nextAfterRemoval(threads, new Set([asThread('b')]), asThread('b'))).toBe('c')
    expect(nextAfterRemoval(threads, new Set([asThread('c')]), asThread('c'))).toBe('b')
    expect(nextAfterRemoval(threads, new Set([asThread('a'), asThread('b'), asThread('c')]), asThread('b'))).toBeUndefined()
  })
})

describe('pickRange', () => {
  it('selects a range with shift-click', () => {
    const threads = [thread('a', ['inbox'], 3), thread('b', ['inbox'], 2), thread('c', ['inbox'], 1)]
    expect([...pickRange(threads, { cursor: asThread('a'), picked: new Set() }, asThread('c')).picked]).toEqual(['a', 'b', 'c'])
  })

  it('picks just the clicked thread when there is no cursor yet', () => {
    const threads = [thread('a', ['inbox'], 3)]
    expect([...pickRange(threads, { cursor: undefined, picked: new Set() }, asThread('a')).picked]).toEqual(['a'])
  })
})
