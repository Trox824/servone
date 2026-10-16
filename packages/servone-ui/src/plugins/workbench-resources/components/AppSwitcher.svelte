<script lang="ts">
  import type { Application } from '@hcengineering/workbench'
  import { getClient } from '@hcengineering/presentation'
  import { Loading, IconCheck, IconUndo, Label, Icon } from '@hcengineering/ui'
  import { arrangeApps } from '../../../lib/app-rail'
  import { railString, resetAppRail, showApp, unavailableApps, watchAppRail } from '../rail'
  import { hideApplication } from '../utils'

  export let apps: Application[] = []

  const client = getClient()
  const rail = watchAppRail()
  let highlightedIndex = -1

  $: orderedApps = $rail.isLoaded ? arrangeApps(apps, $rail.order, unavailableApps(apps, $rail)) : []
  $: hiddenAppIds = new Set<string>($rail.hidden.map((hiddenDoc) => hiddenDoc.attachedTo))
  $: isCustomized = $rail.orderDoc !== undefined || $rail.hidden.length > 0
  $: lastRowIndex = orderedApps.length - (isCustomized ? 0 : 1)

  function toggleApp (app: Application): void {
    if (hiddenAppIds.has(app._id)) {
      void showApp(client, $rail, app._id)
    } else {
      void hideApplication(app)
    }
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      highlightedIndex = Math.min(highlightedIndex + 1, lastRowIndex)
    } else if (event.key === 'ArrowUp') {
      highlightedIndex = highlightedIndex < 0 ? highlightedIndex : Math.max(highlightedIndex - 1, 0)
    } else if (event.key !== 'Tab') {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="antiPopup min-w-60" on:keydown={handleKeydown}>
  <div class="ap-space x2"></div>
  <div class="ap-scroll">
    <div class="ap-box">
      {#if !$rail.isLoaded}
        <div class="ap-menuItem empty"><Loading /></div>
      {:else}
        {#each orderedApps as app, rowIndex (app._id)}
          {@const isShown = !hiddenAppIds.has(app._id)}
          <button
            type="button"
            class="ap-menuItem withIcon flex-row-center flex-grow"
            class:hover={highlightedIndex === rowIndex}
            data-id={`app-switcher-row-${app.alias}`}
            aria-pressed={isShown}
            on:mouseover={() => (highlightedIndex = rowIndex)}
            on:focus={() => (highlightedIndex = rowIndex)}
            on:click={() => toggleApp(app)}
          >
            <div class="icon mr-2"><Icon icon={app.icon} size={'small'} /></div>
            <span class="label overflow-label flex-grow"><Label label={app.label} /></span>
            <div class="ap-check">
              {#if isShown}
                <IconCheck size={'small'} />
              {/if}
            </div>
          </button>
        {/each}
        {#if isCustomized}
          <div class="ap-menuItem separator halfMargin"></div>
          <button
            type="button"
            class="ap-menuItem withIcon flex-row-center flex-grow"
            class:hover={highlightedIndex === orderedApps.length}
            data-id="app-switcher-reset"
            on:mouseover={() => (highlightedIndex = orderedApps.length)}
            on:focus={() => (highlightedIndex = orderedApps.length)}
            on:click={() => resetAppRail(client, $rail)}
          >
            <div class="icon mr-2"><IconUndo size={'small'} /></div>
            <span class="label overflow-label flex-grow"><Label label={railString.ResetSidebar} /></span>
          </button>
        {/if}
      {/if}
    </div>
  </div>
  <div class="ap-space x2"></div>
</div>
