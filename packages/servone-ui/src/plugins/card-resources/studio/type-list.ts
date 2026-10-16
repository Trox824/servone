import type { ConfigSnapshot, CreateTypeOp, RecordTypeInfo, SpaceInfo } from '@servone/config'

const FALLBACK_KEY = 'loai-ho-so'

export function byName<T extends { name: string }> (a: T, b: T): number {
  return a.name.localeCompare(b.name, 'vi')
}

export function customerTypes (snapshot: ConfigSnapshot): RecordTypeInfo[] {
  return snapshot.types.filter((it) => !it.isSystem && !it.isArchived).sort(byName)
}

export function activeTypes (snapshot: ConfigSnapshot): RecordTypeInfo[] {
  return snapshot.types.filter((it) => !it.isArchived).sort(byName)
}

export function activeSpaces (snapshot: ConfigSnapshot): SpaceInfo[] {
  return snapshot.spaces.filter((it) => !it.isArchived).sort(byName)
}

export function findType (snapshot: ConfigSnapshot, key: string): RecordTypeInfo | undefined {
  return snapshot.types.find((it) => it.key === key && !it.isArchived)
}

export function takenKeys (snapshot: ConfigSnapshot): Set<string> {
  return new Set([...snapshot.types.map((it) => it.key), ...snapshot.groups.map((it) => it.key)])
}

export function uniqueKey (base: string, taken: ReadonlySet<string>): string {
  const root = base === '' ? FALLBACK_KEY : base
  if (!taken.has(root)) return root
  for (let suffix = 2; ; suffix++) {
    const candidate = `${root}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

export function normalizeName (raw: string): string {
  return raw.normalize('NFC').trim().toLocaleLowerCase('vi')
}

export function isNameTaken (snapshot: ConfigSnapshot, name: string, exceptKey?: string): boolean {
  const wanted = normalizeName(name)
  return activeTypes(snapshot).some((it) => it.key !== exceptKey && normalizeName(it.name) === wanted)
}

export function createTypeOp (key: string, name: string, basedOn: string | undefined, spaces: string[]): CreateTypeOp {
  const op: CreateTypeOp = { op: 'createType', key, name: name.trim(), spaces }
  if (basedOn !== undefined) op.basedOn = basedOn
  return op
}
