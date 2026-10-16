import { VISIBILITY_CHOICES, choiceOf, isVisibilityChoice, visibilityOf } from '../visibility'

describe('visibility choice', () => {
  it('maps an unset visibility to default and back', () => {
    expect(choiceOf(undefined)).toBe('default')
    expect(visibilityOf('default')).toBeUndefined()
  })
  it('keeps explicit levels', () => {
    for (const v of ['public', 'freeBusy', 'private'] as const) {
      expect(visibilityOf(choiceOf(v))).toBe(v)
    }
  })
  it('lists default first and recognizes only known choices', () => {
    expect(VISIBILITY_CHOICES[0]).toBe('default')
    expect(isVisibilityChoice('private')).toBe(true)
    expect(isVisibilityChoice('secret')).toBe(false)
  })
})
