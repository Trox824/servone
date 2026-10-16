<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import { resizeObserver, CheckBox, Label, ListView } from '../original'
  import { menuPopupClass, menuItemClass, menuScrollClass } from '../lib/menu-classes'

  export let items: Record<any, IntlString>
  export let selected: any | undefined = undefined

  const dispatch = createEventDispatcher()

  let highlightedRow = 0
  let listView: ListView

  $: recordEntries = Object.entries(items)

  function onKeyDown (event: KeyboardEvent): void {
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.stopPropagation()
      event.preventDefault()
      listView.select(highlightedRow + (event.code === 'ArrowUp' ? -1 : 1))
    } else if (event.code === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      dispatch('close', items[highlightedRow])
    }
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class={menuPopupClass}
  on:keydown={onKeyDown}
  use:resizeObserver={() => {
    dispatch('changeContent')
  }}
>
  <div class={menuScrollClass}>
    <ListView bind:this={listView} kind={'full-size'} count={recordEntries.length} bind:selection={highlightedRow}>
      <svelte:fragment slot="item" let:item={rowIndex}>
        {@const [entryKey, entryLabel] = recordEntries[rowIndex]}
        <button type="button" class={menuItemClass} on:click={() => { dispatch('close', entryKey) }}>
          <span class="flex-1 line-clamp-2 text-left"><Label label={entryLabel} /></span>
          {#if entryKey === selected}
            <CheckBox checked kind={'primary'} />
          {/if}
        </button>
      </svelte:fragment>
    </ListView>
  </div>
</div>
