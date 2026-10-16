import { withLanguage } from '../utils'

describe('withLanguage', () => {
  it('overrides the branding language with a supported locale', () => {
    expect(withLanguage({ key: 'servone', language: 'vi' }, 'en')).toEqual({ key: 'servone', language: 'en' })
    expect(withLanguage(null, 'vi')).toEqual({ language: 'vi' })
  })

  it('keeps the branding for missing or unsupported locales', () => {
    const branding = { key: 'servone', language: 'vi' }
    expect(withLanguage(branding, undefined)).toBe(branding)
    expect(withLanguage(branding, 'fr')).toBe(branding)
    expect(withLanguage(null, null)).toBeNull()
  })
})
