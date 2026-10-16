import { findPreset, IMAP_PORTS, PROVIDER_PRESETS, SMTP_PORTS } from '../providers'

describe('provider presets', () => {
  it('uses only allowed ports and no plaintext', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(IMAP_PORTS).toContain(preset.imap.port)
      expect(SMTP_PORTS).toContain(preset.smtp.port)
      expect(preset.imap.security).not.toBe('plain')
      expect(preset.smtp.security).not.toBe('plain')
    }
  })

  it('signs in to Outlook with OAuth and to Gmail with an app password', () => {
    expect(findPreset('outlook')?.authKind).toBe('oauth')
    expect(findPreset('gmail')?.authKind).toBe('password')
    expect(findPreset('gmail')?.appPasswordHelpUrl).toMatch(/^https:\/\//)
  })

  it('has no preset for a custom server', () => {
    expect(findPreset('other')).toBeUndefined()
  })
})
