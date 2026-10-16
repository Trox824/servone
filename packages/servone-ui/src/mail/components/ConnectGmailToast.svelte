<script lang="ts">
  import { NotificationToast, type Notification } from '@hcengineering/ui'
  import { Button } from '../../lib/components/ui/button'
  import { googleConsentUrl } from '../api'
  import { declineGmailPrompt } from '../lib/gmail-prompt'
  import { text } from '../plugin'

  export let notification: Notification
  export let onRemove: () => void

  async function connect (): Promise<void> {
    window.location.assign(await googleConsentUrl())
  }

  function decline (): void {
    declineGmailPrompt()
    onRemove()
  }
</script>

<NotificationToast title={notification.title} severity={notification.severity} onClose={onRemove}>
  <svelte:fragment slot="content">{notification.subTitle ?? ''}</svelte:fragment>
  <svelte:fragment slot="buttons">
    <Button variant="ghost" data-id="mail-connect-later" onclick={decline}>{text('NotNow')}</Button>
    <Button class="ml-auto" data-id="mail-connect-gmail" onclick={connect}>{text('ConnectGmail')}</Button>
  </svelte:fragment>
</NotificationToast>
