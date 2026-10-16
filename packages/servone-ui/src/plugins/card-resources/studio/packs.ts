import type { ConfigSnapshot, Pack, PackInstallState, RecordTypeInfo } from '@servone/config'
import type { SaveResult } from './save'
import { text } from './strings'

export function installLabel (state: PackInstallState): string {
  switch (state) {
    case 'notInstalled':
      return text('PackInstall')
    case 'partial':
      return text('PackInstallMissing')
    case 'installed':
      return text('PackInstalledBadge')
  }
}

export function canInstall (state: PackInstallState): boolean {
  return state !== 'installed'
}

export function stateBadge (state: PackInstallState): string | undefined {
  switch (state) {
    case 'notInstalled':
      return undefined
    case 'partial':
      return text('PackPartialBadge')
    case 'installed':
      return text('PackInstalledBadge')
  }
}

export function installNotice (pack: Pack, outcome: SaveResult): string | undefined {
  if (outcome.kind === 'applied') return text('PackInstalled', { name: pack.name })
  if (outcome.kind === 'unchanged') return text('PackUpToDate', { name: pack.name })
  return undefined
}

export function withParents (snapshot: ConfigSnapshot, selected: readonly string[]): string[] {
  const keys = [...selected]
  for (let i = 0; i < keys.length; i++) {
    const basedOn = snapshot.types.find((it) => it.key === keys[i])?.basedOn
    const parent = snapshot.types.find((it) => it.key === basedOn)
    if (parent !== undefined && !parent.isSystem && !keys.includes(parent.key)) keys.push(parent.key)
  }
  return keys
}

export function addedParents (snapshot: ConfigSnapshot, selected: readonly string[]): RecordTypeInfo[] {
  const added = withParents(snapshot, selected).filter((key) => !selected.includes(key))
  return snapshot.types.filter((it) => added.includes(it.key))
}

export function packFileName (key: string): string {
  return `${key}.pack.json`
}

export function packFileText (pack: Pack): string {
  return `${JSON.stringify(pack, null, 2)}\n`
}
