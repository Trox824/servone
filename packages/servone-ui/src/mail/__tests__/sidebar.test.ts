import { badgeText, shouldInstallMailApp } from '../sidebar'

jest.mock('@hcengineering/presentation', () => ({ __esModule: true, default: { metadata: { Token: 'token' } } }))

describe('mail sidebar', () => {
  it('installs only when the app is missing and it was not tried this page load', () => {
    expect(shouldInstallMailApp(false, false)).toBe(true)
    expect(shouldInstallMailApp(true, false)).toBe(false)
    expect(shouldInstallMailApp(false, true)).toBe(false)
  })

  it('caps the badge at 99+', () => {
    expect(badgeText(0)).toBe('')
    expect(badgeText(7)).toBe('7')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
  })
})
