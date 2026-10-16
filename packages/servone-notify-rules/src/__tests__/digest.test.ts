import { parseDigest } from '../digest'

const valid = { isEnabled: true, idleHours: 4, locale: 'vi' }

describe('parseDigest', () => {
  it('reads a valid digest setting', () => {
    expect(parseDigest({ enabled: true, servoneDigest: valid })).toEqual(valid)
    expect(parseDigest({ enabled: false, servoneDigest: { ...valid, isEnabled: false, idleHours: 24, locale: 'en' } }))
      .toEqual({ isEnabled: false, idleHours: 24, locale: 'en' })
  })
  it.each([
    ['missing', undefined],
    ['null', null],
    ['idle hours not offered', { ...valid, idleHours: 3 }],
    ['idle hours as string', { ...valid, idleHours: '4' }],
    ['unknown locale', { ...valid, locale: 'fr' }],
    ['isEnabled not boolean', { ...valid, isEnabled: 1 }],
    ['no locale', { isEnabled: true, idleHours: 4 }]
  ])('rejects %s', (_name, servoneDigest) => {
    expect(parseDigest({ enabled: true, servoneDigest })).toBeUndefined()
  })
  it('is undefined without a setting', () => {
    expect(parseDigest(undefined)).toBeUndefined()
  })
})
