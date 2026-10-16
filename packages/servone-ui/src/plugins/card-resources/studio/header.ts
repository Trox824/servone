import type { ArchiveTypeOp, ChangeRecord, ConfigSnapshot } from '@servone/config'

export function archiveOp (typeKey: string): ArchiveTypeOp {
  return { op: 'archiveType', type: typeKey }
}

export function archivePhrase (change: ChangeRecord, snapshot: ConfigSnapshot): string | undefined {
  const archive = change.ops.find((op): op is ArchiveTypeOp => op.op === 'archiveType')
  if (archive === undefined) return undefined
  return snapshot.types.find((it) => it.key === archive.type)?.name ?? archive.type
}
