<script lang="ts">
  import { NotificationSeverity, NotificationToast, type Notification } from '@hcengineering/ui'
  import { Button } from '../../../../lib/components/ui/button'
  import { text } from '../strings'
  import { takeUndoAction } from '../undo-actions'

  export let notification: Notification
  export let onRemove: () => void

  $: changeId = typeof notification.params?.changeId === 'string' ? notification.params.changeId : undefined

  function undo (): void {
    const action = changeId !== undefined ? takeUndoAction(changeId) : undefined
    onRemove()
    action?.()
  }
</script>

<NotificationToast title={notification.title} severity={NotificationSeverity.Success} onClose={onRemove}>
  <svelte:fragment slot="content">{notification.subTitle ?? ''}</svelte:fragment>
  <svelte:fragment slot="buttons">
    <Button class="ml-auto" data-id="studio-undo" variant="outline" onclick={undo}>{text('Undo')}</Button>
  </svelte:fragment>
</NotificationToast>
