import type { PersonId } from '@hcengineering/core'
import type { ChangeRecord, ChangeStatus } from '@servone/config'
import type { BadgeTone } from './diff'
import { text, type StringKey } from './strings'

export interface Viewer {
  socialIds: PersonId[]
  isMaintainer: boolean
}

export interface ChangeRow {
  change: ChangeRecord
  statusLabel: string
  tone: BadgeTone
  isOwn: boolean
  isOwnPending: boolean
  canApprove: boolean
  canReject: boolean
  rejectLabel: string
  canUndo: boolean
  canDiscard: boolean
}

const STATUS_KEY: Record<ChangeStatus, StringKey> = {
  draft: 'StatusDraft',
  pending: 'StatusPending',
  applied: 'StatusApplied',
  undone: 'StatusUndone',
  rejected: 'StatusRejected'
}

const STATUS_TONE: Record<ChangeStatus, BadgeTone> = {
  draft: 'outline',
  pending: 'default',
  applied: 'secondary',
  undone: 'outline',
  rejected: 'outline'
}

export function statusLabel (status: ChangeStatus): string {
  return text(STATUS_KEY[status])
}

export function changeRows (changes: ChangeRecord[], viewer: Viewer): ChangeRow[] {
  return [...changes]
    .sort((a, b) => b.createdOn - a.createdOn)
    .map((change) => {
      const isOwn = viewer.socialIds.includes(change.author)
      const isPending = change.status === 'pending'
      return {
        change,
        statusLabel: statusLabel(change.status),
        tone: STATUS_TONE[change.status],
        isOwn,
        isOwnPending: isPending && isOwn,
        canApprove: isPending && viewer.isMaintainer && !isOwn,
        canReject: isPending && viewer.isMaintainer,
        rejectLabel: isOwn ? text('Withdraw') : text('Reject'),
        canUndo: change.status === 'applied' && viewer.isMaintainer,
        canDiscard: change.status === 'draft' && viewer.isMaintainer
      }
    })
}

export function lastUndoable (changes: ChangeRecord[]): ChangeRecord | undefined {
  return [...changes]
    .filter((change) => change.status === 'applied' && change.undoOf === undefined && change.inverse.length > 0)
    .sort((a, b) => b.createdOn - a.createdOn)[0]
}
