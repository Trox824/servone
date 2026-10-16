import { triageReasons } from '../triage'

describe('triageReasons', () => {
  const ready = { points: 3, hasEpic: true, isBug: false }

  it('passes an estimated item in an epic', () => {
    expect(triageReasons(ready, 'fibonacci', true)).toEqual([])
  })

  it('flags a missing estimate and a missing epic', () => {
    expect(triageReasons({ points: null, hasEpic: false, isBug: false }, 'fibonacci', true)).toEqual(['points', 'epic'])
  })

  it('does not ask for an estimate when the scale is off', () => {
    expect(triageReasons({ ...ready, points: null }, 'off', true)).toEqual([])
  })

  it('lets bugs stand alone, and asks for no epic when the project has none', () => {
    expect(triageReasons({ ...ready, hasEpic: false, isBug: true }, 'fibonacci', true)).toEqual([])
    expect(triageReasons({ ...ready, hasEpic: false }, 'fibonacci', false)).toEqual([])
  })
})
