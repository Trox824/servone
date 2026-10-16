<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { getCurrentLocation, navigate, NotificationSeverity, NotificationToast, type Notification } from '@hcengineering/ui'
  import { MAIL_APP_ALIAS, type MailThreadCard } from '@servone/mail'

  export let notification: Notification
  export let onRemove: () => void

  $: threadId = typeof notification.params?.threadId === 'string' ? (notification.params.threadId as Ref<MailThreadCard>) : undefined

  function open (): void {
    if (threadId === undefined) return
    const loc = getCurrentLocation()
    loc.path[2] = MAIL_APP_ALIAS
    loc.path[3] = threadId
    loc.path.length = 4
    navigate(loc)
    onRemove()
  }
</script>

<NotificationToast title={notification.title} severity={NotificationSeverity.Success} onClose={onRemove}>
  <svelte:fragment slot="content">
    <button type="button" class="new-mail-toast__open" onclick={open}>{notification.subTitle ?? ''}</button>
  </svelte:fragment>
</NotificationToast>

<style>
  .new-mail-toast__open {
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  /* Toasts render outside .mail-app, and the global button reset removes the outline. */
  .new-mail-toast__open:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
</style>
