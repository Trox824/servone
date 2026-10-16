import type { Ref } from '@hcengineering/core'
import type { MailFolderCard, MailThreadCard } from '@servone/mail'
import type { StringKey } from '../strings'
import type { ThreadAction } from './actions'
import { runThreadAction, type BulkDeps } from './bulk'
import { folderByRole, folderLabelKey, orderFolders } from './folders'
import { nextAfterRemoval } from './threads'

export interface MailView {
  folder: MailFolderCard | undefined
  folders: MailFolderCard[]
  visible: MailThreadCard[]
  cursor: Ref<MailThreadCard> | undefined
  open: MailThreadCard | undefined
}

export interface CommandDeps {
  bulk: BulkDeps
  view: () => MailView
  land: (cursor: Ref<MailThreadCard> | undefined, open: Ref<MailThreadCard> | undefined) => void
  confirmDeleteForever: (count: number) => Promise<boolean>
  text: (key: StringKey, params?: Record<string, string | number>) => string
}

export function folderLabel (text: CommandDeps['text'], folder: MailFolderCard): string {
  const key = folderLabelKey(folder.mailRole)
  return key !== undefined ? text(key) : folder.title
}

export function moveTargets (folders: MailFolderCard[], current: Ref<MailFolderCard> | undefined): MailFolderCard[] {
  return orderFolders(folders).filter((candidate) => candidate._id !== current && candidate.mailRole !== 'sent' && candidate.mailRole !== 'drafts')
}

function removeAndLand (deps: CommandDeps, targets: Array<Ref<MailThreadCard>>, action: ThreadAction, title: string): void {
  const { folder, visible, cursor, open } = deps.view()
  if (folder === undefined || targets.length === 0) return
  const removed = new Set(targets)
  const landOn = (ref: Ref<MailThreadCard> | undefined): Ref<MailThreadCard> | undefined =>
    ref !== undefined && removed.has(ref) ? nextAfterRemoval(visible, removed, ref) : ref
  deps.land(landOn(cursor), landOn(open?._id))
  void runThreadAction(deps.bulk, targets, action, folder._id, title)
}

export function archive (deps: CommandDeps, targets: Array<Ref<MailThreadCard>>): void {
  const archiveFolder = folderByRole(deps.view().folders, 'archive')
  if (archiveFolder === undefined) return
  removeAndLand(deps, targets, { kind: 'move', target: archiveFolder._id }, deps.text('Archived', { count: targets.length }))
}

export async function deleteThreads (deps: CommandDeps, targets: Array<Ref<MailThreadCard>>): Promise<void> {
  if (targets.length === 0) return
  const { folder, folders } = deps.view()
  const title = deps.text('Deleted', { count: targets.length })
  if (folder?.mailRole === 'trash') {
    if (!(await deps.confirmDeleteForever(targets.length))) return
    removeAndLand(deps, targets, { kind: 'deleteForever' }, title)
    return
  }
  const trash = folderByRole(folders, 'trash')
  if (trash === undefined) return
  removeAndLand(deps, targets, { kind: 'move', target: trash._id }, title)
}

export function moveTo (deps: CommandDeps, targets: Array<Ref<MailThreadCard>>, target: MailFolderCard): void {
  removeAndLand(deps, targets, { kind: 'move', target: target._id }, deps.text('Moved', { count: targets.length, folder: folderLabel(deps.text, target) }))
}

function targetCards (view: MailView, targets: Array<Ref<MailThreadCard>>): MailThreadCard[] {
  const pool = view.open !== undefined ? [...view.visible, view.open] : view.visible
  return pool.filter((candidate) => targets.includes(candidate._id))
}

export function setRead (deps: CommandDeps, targets: Array<Ref<MailThreadCard>>, isRead: boolean): void {
  const { folder } = deps.view()
  if (folder === undefined || targets.length === 0) return
  void runThreadAction(deps.bulk, targets, { kind: 'read', isRead }, folder._id, '')
}

export function toggleRead (deps: CommandDeps, targets: Array<Ref<MailThreadCard>>): void {
  setRead(deps, targets, targetCards(deps.view(), targets).some((candidate) => candidate.mailHasUnread))
}

export function toggleStar (deps: CommandDeps, targets: Array<Ref<MailThreadCard>>): void {
  const view = deps.view()
  if (view.folder === undefined || targets.length === 0) return
  const isStarred = targetCards(view, targets).some((candidate) => !candidate.mailIsStarred)
  void runThreadAction(deps.bulk, targets, { kind: 'star', isStarred }, view.folder._id, '')
}
