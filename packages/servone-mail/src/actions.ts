import type { Ref } from '@hcengineering/core'
import type { MailFolderCard, MailMessageFields } from './fields'
import type { MailLocation } from './locations'
import type { FolderRole } from './types'

export type MessageChange = Partial<Pick<MailMessageFields, 'mailIsRead' | 'mailIsStarred' | 'mailTargetFolder' | 'mailIsDeleted'>>

export type ImapAction =
  | { kind: 'addFlags' | 'removeFlags', folder: Ref<MailFolderCard>, uids: number[], flags: string[] }
  | { kind: 'move', folder: Ref<MailFolderCard>, uids: number[], target: Ref<MailFolderCard> }
  | { kind: 'expunge', folder: Ref<MailFolderCard>, uids: number[] }

function byFolder (locations: MailLocation[]): Map<Ref<MailFolderCard>, number[]> {
  const grouped = new Map<Ref<MailFolderCard>, number[]>()
  for (const location of locations) grouped.set(location.folder, [...(grouped.get(location.folder) ?? []), location.uid])
  return grouped
}

function flagActions (flag: string, isOn: boolean, locations: MailLocation[]): ImapAction[] {
  return [...byFolder(locations)].map(([folder, uids]) => ({ kind: isOn ? 'addFlags' : 'removeFlags', folder, uids, flags: [flag] }))
}

function moveSources (target: Ref<MailFolderCard>, locations: MailLocation[], roles: Map<Ref<MailFolderCard>, FolderRole>): MailLocation[] {
  const targetRole = roles.get(target)
  // Archive on Gmail means "drop the Inbox label"; moving out of other label folders would strip those labels too.
  if (targetRole === 'archive' || targetRole === 'all') return locations.filter((location) => roles.get(location.folder) === 'inbox')
  // Taking a message out of Gmail's All Mail trashes it, so All Mail is a source only for trash, and only when no label
  // folder holds the message: trashing from a label already empties All Mail, and a second MOVE would find no UID.
  const labelled = locations.filter((location) => location.folder !== target && roles.get(location.folder) !== 'all')
  if (labelled.length > 0 || targetRole !== 'trash') return labelled
  return locations.filter((location) => roles.get(location.folder) === 'all')
}

export function planActions (change: MessageChange, locations: MailLocation[], roles: Map<Ref<MailFolderCard>, FolderRole>): ImapAction[] {
  const actions: ImapAction[] = []
  if (change.mailIsRead !== undefined) actions.push(...flagActions('\\Seen', change.mailIsRead, locations))
  if (change.mailIsStarred !== undefined) actions.push(...flagActions('\\Flagged', change.mailIsStarred, locations))
  const target = change.mailTargetFolder
  if (target !== undefined && target !== null) {
    for (const [folder, uids] of byFolder(moveSources(target, locations, roles))) actions.push({ kind: 'move', folder, uids, target })
  }
  if (change.mailIsDeleted === true) {
    for (const [folder, uids] of byFolder(locations)) actions.push({ kind: 'expunge', folder, uids })
  }
  return actions
}
