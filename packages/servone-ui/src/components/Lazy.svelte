<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { lazyObserver, isLazyEnabled } from '../original'

  const dispatch = createEventDispatcher<{ visible: undefined }>()

  let isContentShown = !isLazyEnabled()

  function onIntersection (isVisible: boolean, stopObserving?: () => void): void {
    if (!isVisible || isContentShown) return
    isContentShown = true
    dispatch('visible')
    stopObserving?.()
  }
</script>

{#if isContentShown}
  <slot />
{:else}
  <div data-slot="lazy-placeholder" use:lazyObserver={onIntersection}>
    <slot name="loading">&#8203;</slot>
  </div>
{/if}
