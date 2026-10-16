<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { get } from 'svelte/store'
  import { addNotification, deviceOptionsStore, NotificationSeverity } from '@hcengineering/ui'
  import { languageStore } from '@hcengineering/theme'
  import { SimpleNotification } from '@hcengineering/view-resources'
  import { currentRoom } from '../stores'
  import RoomComponent from './Room.svelte'
  import { textOf } from '../calls/strings'

  const dispatch = createEventDispatcher()

  export function canClose (): boolean {
    return false
  }

  $: if ($currentRoom === undefined) dispatch('close')

  function minimizeCall (): void {
    dispatch('close')
    const translate = textOf(get(languageStore) === 'vi' ? 'vi' : 'en')
    addNotification(
      translate('CallMinimizedTitle'),
      translate('CallMinimizedBody'),
      SimpleNotification,
      undefined,
      NotificationSeverity.Info
    )
  }
</script>

{#if $currentRoom !== undefined}
  <div class="servone-call-stage">
    <RoomComponent room={$currentRoom} onMinimize={$deviceOptionsStore.isMobile ? undefined : minimizeCall} />
  </div>
{/if}

<style>
  .servone-call-stage {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 12px;
  }

  :global(.popup:has(> .servone-call-stage)) {
    border-color: transparent;
  }
</style>
