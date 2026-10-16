import { readOverlay, readShowDeclined, readView, writeOverlay, writeShowDeclined, writeView, type KeyStore } from '../storage'

function memory (): KeyStore {
  const kept = new Map<string, string>()
  return { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => { kept.set(k, v) } }
}

const blocked: KeyStore = {
  getItem: () => { throw new DOMException('blocked', 'SecurityError') },
  setItem: () => { throw new DOMException('blocked', 'SecurityError') }
}

describe('view storage', () => {
  it('round-trips a view', () => {
    const store = memory()
    writeView(store, 'thang')
    expect(readView(store)).toBe('thang')
  })
  it('defaults to Ngày for empty, unknown, or blocked storage', () => {
    expect(readView(memory())).toBe('ngay')
    const store = memory()
    store.setItem('servone.lich.view', 'planner')
    expect(readView(store)).toBe('ngay')
    expect(readView(blocked)).toBe('ngay')
    expect(() => writeView(blocked, 'tuan')).not.toThrow()
  })
})

describe('overlay storage', () => {
  it('round-trips people', () => {
    const store = memory()
    writeOverlay(store, ['an', 'binh'])
    expect(readOverlay(store)).toEqual(['an', 'binh'])
  })
  it('drops garbage and falls back to empty', () => {
    const store = memory()
    store.setItem('servone.lich.overlay', '{not json')
    expect(readOverlay(store)).toEqual([])
    store.setItem('servone.lich.overlay', '["an", 3, null]')
    expect(readOverlay(store)).toEqual(['an'])
    store.setItem('servone.lich.overlay', '{"an": true}')
    expect(readOverlay(store)).toEqual([])
    expect(readOverlay(blocked)).toEqual([])
  })
})

describe('show declined storage', () => {
  it('defaults to shown', () => {
    expect(readShowDeclined(memory())).toBe(true)
    expect(readShowDeclined(blocked)).toBe(true)
  })
  it('round-trips the choice', () => {
    const store = memory()
    writeShowDeclined(store, false)
    expect(readShowDeclined(store)).toBe(false)
    writeShowDeclined(store, true)
    expect(readShowDeclined(store)).toBe(true)
    expect(() => writeShowDeclined(blocked, false)).not.toThrow()
  })
})
