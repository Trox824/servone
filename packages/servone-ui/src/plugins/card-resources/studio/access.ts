import type { AccountUuid } from '@hcengineering/core'
import type { AccessPreset, ConfigSnapshot, RecordTypeInfo, SetAccessOp, SpaceAccess } from '@servone/config'
import { text, type StringKey } from './strings'
import { activeSpaces } from './type-list'

export const PRESETS: AccessPreset[] = ['viewer', 'editor', 'manager']

const PRESET_KEY: Record<AccessPreset, StringKey> = {
  viewer: 'PresetViewer',
  editor: 'PresetEditor',
  manager: 'PresetManager'
}

export function presetLabel (preset: AccessPreset): string {
  return text(PRESET_KEY[preset])
}

export interface AccessRow {
  space: string
  name: string
  isRestricted: boolean
  viewer: AccountUuid[]
  editor: AccountUuid[]
  manager: AccountUuid[]
}

export function accessRows (snapshot: ConfigSnapshot, type: RecordTypeInfo): AccessRow[] {
  return activeSpaces(snapshot).map((space) => {
    const assigned = type.access.find((it) => it.space === space.id)
    return {
      space: space.id,
      name: space.name,
      isRestricted: space.isRestricted,
      viewer: assigned?.viewer ?? [],
      editor: assigned?.editor ?? [],
      manager: assigned?.manager ?? []
    }
  })
}

export function withPeople (rows: AccessRow[], space: string, preset: AccessPreset, people: AccountUuid[]): AccessRow[] {
  return rows.map((row) => (row.space === space ? { ...row, [preset]: people } : row))
}

export function withRestricted (rows: AccessRow[], space: string, isRestricted: boolean): AccessRow[] {
  return rows.map((row) => (row.space === space ? { ...row, isRestricted } : row))
}

export function isOpenWithPeople (row: AccessRow): boolean {
  return !row.isRestricted && PRESETS.some((preset) => row[preset].length > 0)
}

function isSameSet (a: AccountUuid[], b: AccountUuid[]): boolean {
  return a.length === b.length && a.every((it) => b.includes(it))
}

export function accessOp (typeKey: string, before: AccessRow[], after: AccessRow[]): SetAccessOp | undefined {
  const spaces: SpaceAccess[] = []
  for (const row of after) {
    const previous = before.find((it) => it.space === row.space)
    if (previous === undefined) continue
    const access: SpaceAccess = { space: row.space, isRestricted: row.isRestricted }
    let hasChange = row.isRestricted !== previous.isRestricted
    for (const preset of PRESETS) {
      if (isSameSet(row[preset], previous[preset])) continue
      access[preset] = row[preset]
      hasChange = true
    }
    if (hasChange) spaces.push(access)
  }
  return spaces.length === 0 ? undefined : { op: 'setAccess', type: typeKey, access: { spaces } }
}
