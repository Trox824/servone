import type { FolderRole, MailFolderCard } from '@servone/mail'
import type { StringKey } from '../strings'

export const SYSTEM_ROLES: FolderRole[] = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'spam']

const FOLDER_LABEL_KEYS: Partial<Record<FolderRole, StringKey>> = {
  inbox: 'Inbox',
  sent: 'Sent',
  drafts: 'Drafts',
  archive: 'Archive',
  trash: 'Trash',
  spam: 'Spam'
}

export function folderLabelKey (role: FolderRole): StringKey | undefined {
  return FOLDER_LABEL_KEYS[role]
}

export function folderByRole (folders: MailFolderCard[], role: FolderRole): MailFolderCard | undefined {
  return folders.find((folder) => folder.mailRole === role)
}

export function orderFolders (folders: MailFolderCard[]): MailFolderCard[] {
  const system = SYSTEM_ROLES
    .map((role) => folderByRole(folders, role))
    .filter((candidate): candidate is MailFolderCard => candidate !== undefined)
  const other = folders
    .filter((candidate) => candidate.mailRole === 'other')
    .sort((a, b) => a.mailPath.localeCompare(b.mailPath, 'vi'))
  return [...system, ...other]
}
