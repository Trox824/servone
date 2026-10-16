<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte'
  import { IconSearch } from '../original'
  import uiPlugin from '@hcengineering/ui/src/plugin'
  import EditWithIcon from './EditWithIcon.svelte'

  export let value: string = ''
  export let width: string = '12rem'
  export let kind: 'ghost' | 'secondary' = 'ghost'

  const PUBLISH_DELAY_MS = 500
  const dispatch = createEventDispatcher<{ change: string }>()

  let draftText = value
  let pendingTimer: ReturnType<typeof setTimeout> | undefined

  $: draftText = value

  function cancelPending (): void {
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer)
      pendingTimer = undefined
    }
  }

  function publishNow (): void {
    cancelPending()
    value = draftText
    dispatch('change', draftText)
  }

  function schedulePublish (): void {
    cancelPending()
    pendingTimer = setTimeout(publishNow, PUBLISH_DELAY_MS)
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (event.key === 'Enter') publishNow()
  }

  onDestroy(cancelPending)
</script>

<EditWithIcon
  icon={IconSearch}
  {width}
  {kind}
  placeholder={uiPlugin.string.Search}
  bind:value={draftText}
  on:input={schedulePublish}
  on:change={schedulePublish}
  on:keydown={handleKeydown}
/>
