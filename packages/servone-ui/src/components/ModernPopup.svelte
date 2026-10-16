<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { DropdownIntlItem } from '../original'
  import { Icon, IconCheck, Label, Scroller, resizeObserver, capitalizeFirstLetter, formatKey } from '../original'

  export let items: DropdownIntlItem[]
  export let selected: DropdownIntlItem['id'] | undefined = undefined
  export let params: Record<string, any> = {}

  const dispatch = createEventDispatcher<{ close: DropdownIntlItem['id']; changeContent: undefined }>()

  let rowButtons: HTMLButtonElement[] = []

  function focusRowAt (position: number): void {
    const lastPosition = items.length - 1
    const wrappedPosition = position < 0 ? lastPosition : position > lastPosition ? 0 : position
    rowButtons[wrappedPosition]?.focus()
  }

  function handleRowKeydown (event: KeyboardEvent, position: number): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusRowAt(position + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusRowAt(position - 1)
    }
  }

  function describeChords (keys: string[]): string[][][] {
    return keys.map((keyText) => formatKey(keyText))
  }

  $: hasAnyIcon = items.some((entry) => entry.icon !== undefined)
</script>

<div
  class="hulyPopup-container flex max-h-[22.625rem] min-w-64 max-w-64 flex-col gap-0.5 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
  use:resizeObserver={() => dispatch('changeContent')}
>
  <Scroller padding={'var(--spacing-0_5)'} gap={'flex-gap-0-5'}>
    {#each items as entry, position (entry.id)}
      <!-- svelte-ignore a11y-mouse-events-have-key-events -->
      <button
        type="button"
        bind:this={rowButtons[position]}
        class="hulyPopup-row flex w-full items-center justify-between gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm text-popover-foreground outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        class:withKeys={entry.keys !== undefined && entry.keys.length > 0}
        on:click={() => dispatch('close', entry.id)}
        on:mouseover={() => rowButtons[position]?.focus()}
        on:keydown={(event) => handleRowKeydown(event, position)}
      >
        {#if hasAnyIcon}
          <div class="hulyPopup-row__icon flex-none">
            {#if entry.icon !== undefined}
              <Icon icon={entry.icon} iconProps={entry.iconProps} size={'small'} />
            {/if}
          </div>
        {/if}
        {#if entry.description !== undefined}
          <div class="hulyPopup-row__labels-wrapper flex min-w-0 flex-grow flex-col gap-0.5">
            <span class="hulyPopup-row__label overflow-label truncate">
              <Label label={entry.label} params={entry.params ?? params} />
            </span>
            <span class="hulyPopup-row__label small dark truncate text-xs text-muted-foreground">
              <Label label={entry.description} params={entry.paramsDescription ?? params} />
            </span>
          </div>
        {:else}
          <span class="hulyPopup-row__label min-w-0 flex-grow truncate">
            <Label label={entry.label} params={entry.params ?? params} />
          </span>
        {/if}
        {#if entry.keys !== undefined && entry.keys.length > 0}
          <div class="hulyPopup-row__keys flex flex-none items-center gap-0.5">
            {#each describeChords(entry.keys) as chordSteps, keyPosition}
              {#if keyPosition > 0}
                <span class="mr-1 ml-1">/</span>
              {/if}
              {#each chordSteps as chordStep}
                <span class="key rounded border border-input bg-muted px-1 py-0.5 text-xs text-muted-foreground">
                  {chordStep.map((keyName) => capitalizeFirstLetter(keyName.trim())).join('+')}
                </span>
              {/each}
            {/each}
          </div>
        {/if}
        {#if entry.id === selected}
          <div class="hulyPopup-row__icon flex-none">
            <IconCheck size={'small'} />
          </div>
        {/if}
      </button>
    {/each}
  </Scroller>
</div>
