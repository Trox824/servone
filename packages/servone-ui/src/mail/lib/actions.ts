import type { Ref } from '@hcengineering/core'
import type { MailFolderCard, MailMessageCard, MessageChange } from '@servone/mail'
import { newestMessage } from './body'

export type ThreadAction =
  | { kind: 'read', isRead: boolean }
  | { kind: 'star', isStarred: boolean }
  | { kind: 'move', target: Ref<MailFolderCard> }
  | { kind: 'deleteForever' }

export interface MessageUpdate {
  message: MailMessageCard
  change: MessageChange
}

function changeFor (action: ThreadAction): MessageChange {
  switch (action.kind) {
    case 'read':
      return { mailIsRead: action.isRead }
    case 'star':
      return { mailIsStarred: action.isStarred }
    case 'move':
      return { mailTargetFolder: action.target }
    case 'deleteForever':
      return { mailIsDeleted: true }
  }
}

function starTargets (messages: MailMessageCard[], isStarred: boolean): MailMessageCard[] {
  const candidates = messages.filter((message) => !message.mailIsDraft)
  if (!isStarred) return candidates.filter((message) => message.mailIsStarred)
  const latest = newestMessage(candidates)
  return latest !== undefined && !latest.mailIsStarred ? [latest] : []
}

export function threadActionTargets (messages: MailMessageCard[], action: ThreadAction, from: Ref<MailFolderCard>): MessageUpdate[] {
  let targets: MailMessageCard[]
  switch (action.kind) {
    case 'read':
      targets = messages.filter((message) => !message.mailIsDraft && message.mailIsRead !== action.isRead)
      break
    case 'star':
      targets = starTargets(messages, action.isStarred)
      break
    case 'move':
      targets = messages.filter((message) => !message.mailIsDraft && message.mailFolders.includes(from) && !message.mailFolders.includes(action.target))
      break
    case 'deleteForever':
      targets = messages.filter((message) => message.mailFolders.includes(from))
      break
  }
  const change = changeFor(action)
  return targets.map((message) => ({ message, change }))
}

export function isDestructive (action: ThreadAction): boolean {
  return action.kind === 'move' || action.kind === 'deleteForever'
}
