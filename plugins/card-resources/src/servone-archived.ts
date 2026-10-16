import type { Class, Doc } from '@hcengineering/core'

// servone: Card Studio archives a type with this extra field (packages/servone-config); removed: true would delete its cards.
export function isArchivedType (cls: Class<Doc>): boolean {
  return 'servoneArchived' in cls && cls.servoneArchived === true
}
