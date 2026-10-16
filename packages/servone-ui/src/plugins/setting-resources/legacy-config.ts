const LEGACY_CONFIG = new Set([
  'types',
  'classes',
  'relation',
  'enums',
  'tagrelation',
  'office',
  'relations',
  'message-templates',
  'spaceTypes'
])

export function isLegacyConfigCategory (name: string): boolean {
  return LEGACY_CONFIG.has(name)
}
