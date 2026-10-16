import type { Ref } from '@hcengineering/core'
import { addNotification, NotificationSeverity } from '@hcengineering/ui'
import { SimpleNotification } from '@hcengineering/view-resources'
import type { MailThreadCard } from '@servone/mail'
import { registerUndoAction } from '../../plugins/card-resources/studio/undo-actions'
import { text } from '../plugin'
import MailActionToast from '../components/MailActionToast.svelte'
import ConnectGmailToast from '../components/ConnectGmailToast.svelte'
import NewMailToast from '../components/NewMailToast.svelte'

export function showMailUndoToast (title: string, id: string, onUndo: () => void): void {
  registerUndoAction(id, onUndo)
  addNotification(title, '', MailActionToast, { changeId: id, actionLabel: text('Undo') }, NotificationSeverity.Success)
}

export function showRetryToast (title: string, reason: string, id: string, onRetry: () => void): void {
  registerUndoAction(id, onRetry)
  addNotification(title, reason, MailActionToast, { changeId: id, actionLabel: text('Retry') }, NotificationSeverity.Error)
}

export function showActionFailed (provider: string): void {
  addNotification(text('ActionFailed', { provider }), '', SimpleNotification, undefined, NotificationSeverity.Error)
}

export function showConnectGmailToast (): void {
  addNotification(text('ConnectGmailTitle'), text('ConnectGmailBody'), ConnectGmailToast, undefined, NotificationSeverity.Info)
}

export function showNewMailToast(subject: string, from: string, threadId: Ref<MailThreadCard>): void {
  addNotification(text('NewMail', { from }), subject, NewMailToast, { threadId }, NotificationSeverity.Success)
}
