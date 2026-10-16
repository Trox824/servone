import type { ProjectStatusGroup, ProjectStatusRow } from '@servone/config'

export type DeleteBlock = 'default' | 'last'

export function deleteBlock (group: ProjectStatusGroup, row: ProjectStatusRow): DeleteBlock | undefined {
  if (row.isDefault) return 'default'
  if (group.rows.length <= 1) return 'last'
  return undefined
}

export function dropIndex (from: number, over: number, isAfter: boolean): number | undefined {
  const slot = isAfter ? over + 1 : over
  const index = slot > from ? slot - 1 : slot
  return index === from ? undefined : index
}
