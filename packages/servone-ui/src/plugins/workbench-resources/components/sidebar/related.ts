import type { Location, PanelProps } from '@hcengineering/ui'
import { MAIL_APP_ALIAS } from '@servone/mail'

const MEETINGS_APP = 'love'

export type OpenTarget =
  | { kind: 'doc', _id: string, _class: string }
  | { kind: 'mail', thread: string }
  | { kind: 'meeting', event: string }

export function openTarget (panel: Pick<PanelProps, '_id' | '_class'> | undefined, loc: Pick<Location, 'path' | 'query'>): OpenTarget | undefined {
  if (panel !== undefined) return { kind: 'doc', _id: panel._id, _class: panel._class }
  const thread = loc.path[3]
  if (loc.path[2] === MAIL_APP_ALIAS && thread !== undefined && thread !== '') return { kind: 'mail', thread }
  const event = loc.query?.meeting
  if (loc.path[2] === MEETINGS_APP && event != null && event !== '') return { kind: 'meeting', event }
  return undefined
}

export type RelatedKind = 'meeting' | 'mail' | 'task' | 'chat' | 'file' | 'mention' | 'other'

export const KIND_ORDER: readonly RelatedKind[] = ['meeting', 'mail', 'task', 'chat', 'file', 'mention', 'other']

export interface RelatedRow {
  key: string
  kind: RelatedKind
  title: string
  open: () => void
}

export function groupRelated (rows: RelatedRow[]): Array<{ kind: RelatedKind, rows: RelatedRow[] }> {
  const unique = new Map<string, RelatedRow>()
  for (const row of rows) if (!unique.has(row.key)) unique.set(row.key, row)
  return KIND_ORDER.map((kind) => ({ kind, rows: [...unique.values()].filter((row) => row.kind === kind) })).filter((group) => group.rows.length > 0)
}
