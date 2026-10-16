import { isLegacyConfigCategory } from '../legacy-config'

describe('isLegacyConfigCategory', () => {
  it('hides the card config pages the Cards app replaces', () => {
    for (const name of ['types', 'classes', 'relation', 'enums', 'tagrelation', 'office', 'relations', 'message-templates', 'spaceTypes']) {
      expect(isLegacyConfigCategory(name)).toBe(true)
    }
  })

  it('keeps every other settings page', () => {
    for (const name of ['setting', 'allSpaces', 'general', 'servone-chat', 'password']) {
      expect(isLegacyConfigCategory(name)).toBe(false)
    }
  })
})
