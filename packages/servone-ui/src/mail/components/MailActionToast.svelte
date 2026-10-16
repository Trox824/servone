<script lang="ts">
  import { NotificationToast, type Notification } from '@hcengineering/ui'
  import { Button } from '../../lib/components/ui/button'
  import { takeUndoAction } from '../../plugins/card-resources/studio/undo-actions'

  export let notification: Notification
  export let onRemove: () => void

  $: changeId = typeof notification.params?.changeId === 'string' ? notification.params.changeId : undefined
  $: actionLabel = typeof notification.params?.actionLabel === 'string' ? notification.params.actionLabel : ''

  function runAction (): void {
    const action = changeId !== undefined ? takeUndoAction(changeId) : undefined
    onRemove()
    action?.()
  }
</script>

<NotificationToast title={notification.title} severity={notification.severity} onClose={onRemove}>
  <svelte:fragment slot="content">{notification.subTitle ?? ''}</svelte:fragment>
  <svelte:fragment slot="buttons">
    <Button class="ml-auto" data-id="mail-toast-action" variant="outline" onclick={runAction}>{actionLabel}</Button>
  </svelte:fragment>
</NotificationToast>
