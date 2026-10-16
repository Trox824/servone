<script lang="ts">
  import { getDay, type Timestamp } from '@hcengineering/core'
  import { DateRangePopup, showPopup } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  export let selectedDate: Timestamp | undefined
  export let fixed: boolean = false
  export let idPrefix: string = ''
  export let visible: boolean = true

  const dispatch = createEventDispatcher()

  let pill: HTMLElement | undefined

  const rowBase = 'relative my-2 flex h-6 w-full shrink-0 items-center justify-center'
  const rowDivider = 'before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-border first:before:hidden'

  $: day = selectedDate ? getDay(selectedDate) : undefined
  $: rowId = fixed ? '' : `${idPrefix}${day}`
  $: rowClass = fixed ? rowBase : `${rowBase} ${rowDivider}`
  $: label = day !== undefined ? formatDay(day) : ''

  function formatDay (ms: number): string {
    const date = new Date(ms)
    const isCurrentYear = date.getFullYear() === new Date().getFullYear()
    return date.toLocaleDateString('default', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: isCurrentYear ? undefined : 'numeric'
    })
  }

  function openPicker (): void {
    showPopup(DateRangePopup, {}, pill, (picked: Date | undefined | null) => {
      if (picked instanceof Date) {
        picked.setHours(0, 0, 0, 0)
        dispatch('jumpToDate', { date: picked.getTime() })
      }
    })
  }
</script>

<div id={rowId} class={rowClass}>
  {#if visible}
    <button
      type="button"
      bind:this={pill}
      class="relative cursor-pointer select-none whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
      on:click={openPicker}
    >
      {label}
    </button>
  {/if}
</div>
