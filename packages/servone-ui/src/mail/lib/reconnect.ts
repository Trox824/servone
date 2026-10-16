import type { MailAccountCard } from '@servone/mail'
import { showPopup } from '@hcengineering/ui'
import ConnectScreen from '../components/ConnectScreen.svelte'

export function openReconnect (account: MailAccountCard): void {
  showPopup(ConnectScreen, { account }, 'center')
}
