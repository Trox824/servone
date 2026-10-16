import { readHidden, sourceCounts, visibleItems, writeHidden, type KeyStore } from '../source-filter'

function memory (): KeyStore {
  const kept = new Map<string, string>()
  return { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => { kept.set(k, v) } }
}

const blocked: KeyStore = {
  getItem: () => { throw new DOMException('blocked', 'SecurityError') },
  setItem: () => { throw new DOMException('blocked', 'SecurityError') }
}

const rows = [
  { _id: 'a', _class: 'tracker:class:Issue' },
  { _id: 'b', _class: 'document:class:Document' },
  { _id: 'c', _class: 'tracker:class:Issue' },
  { _id: 'd', _class: 'chunter:class:Channel' }
]

describe('visibleItems', () => {
  it('keeps everything when nothing is hidden', () => {
    expect(visibleItems(rows, new Set())).toBe(rows)
  })
  it('drops rows whose source is hidden', () => {
    const hidden = new Set(['tracker:class:Issue'])
    expect(visibleItems(rows, hidden).map((r) => r._id)).toEqual(['b', 'd'])
  })
})

describe('sourceCounts', () => {
  it('counts loaded rows per source in order of first appearance', () => {
    expect(sourceCounts(rows, new Set())).toEqual([
      { source: 'tracker:class:Issue', count: 2 },
      { source: 'document:class:Document', count: 1 },
      { source: 'chunter:class:Channel', count: 1 }
    ])
  })
  it('keeps a hidden source with no loaded rows so it can be turned back on', () => {
    expect(sourceCounts([rows[1]], new Set(['card:class:Card']))).toEqual([
      { source: 'document:class:Document', count: 1 },
      { source: 'card:class:Card', count: 0 }
    ])
  })
})

describe('hidden source storage', () => {
  it('round-trips per workspace', () => {
    const store = memory()
    writeHidden(store, 'ws1', new Set(['tracker:class:Issue']))
    expect([...readHidden(store, 'ws1')]).toEqual(['tracker:class:Issue'])
    expect(readHidden(store, 'ws2').size).toBe(0)
  })
  it('drops garbage and survives blocked storage', () => {
    const store = memory()
    store.setItem('servone.inbox.hiddenSources.ws1', '{not json')
    expect(readHidden(store, 'ws1').size).toBe(0)
    store.setItem('servone.inbox.hiddenSources.ws1', '["tracker:class:Issue", 3]')
    expect([...readHidden(store, 'ws1')]).toEqual(['tracker:class:Issue'])
    expect(readHidden(blocked, 'ws1').size).toBe(0)
    expect(() => { writeHidden(blocked, 'ws1', new Set(['x'])) }).not.toThrow()
  })
})
