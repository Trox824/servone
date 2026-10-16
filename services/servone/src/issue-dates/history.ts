import core, {
  type Doc,
  type Ref,
  type Status,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  type TxUpdateDoc
} from '@hcengineering/core'
import tracker, { type Issue } from '@hcengineering/tracker'
import type { StatusHistory, StatusKind } from './dates'

export interface StatusTx {
  issue: Ref<Issue>
  status: Ref<Status>
  at: number
}

export function readStatusTx (tx: Tx): StatusTx | undefined {
  if (tx._class === core.class.TxCreateDoc) {
    const create = tx as TxCreateDoc<Issue>
    if (create.objectClass !== tracker.class.Issue || create.attributes.status === undefined) return undefined
    return { issue: create.objectId, status: create.attributes.status, at: create.modifiedOn }
  }
  if (tx._class === core.class.TxUpdateDoc) {
    const update = tx as TxUpdateDoc<Issue>
    if (update.objectClass !== tracker.class.Issue || update.operations.status === undefined) return undefined
    return { issue: update.objectId, status: update.operations.status, at: update.modifiedOn }
  }
  return undefined
}

// Older workspaces wrap attached-doc txes in a collection tx, as sprints/data.ts#unwrap handles in the front.
type StoredTx = TxCUD<Doc> & { tx?: TxCUD<Doc> }

/** Issues without a creation tx (restored from a backup) are left out; the caller estimates them. */
export function statusHistories (txes: StoredTx[], kindOf: (status: Ref<Status>) => StatusKind): Map<Ref<Issue>, StatusHistory> {
  const histories = new Map<Ref<Issue>, StatusHistory>()
  const changes: StatusTx[] = []
  for (const stored of txes) {
    const inner = stored.tx ?? stored
    const read = readStatusTx(inner)
    if (read === undefined) continue
    if (inner._class === core.class.TxCreateDoc) {
      histories.set(read.issue, { created: read.at, initial: kindOf(read.status), changes: [] })
    } else {
      changes.push(read)
    }
  }
  for (const change of changes) {
    histories.get(change.issue)?.changes.push({ kind: kindOf(change.status), at: change.at })
  }
  return histories
}
