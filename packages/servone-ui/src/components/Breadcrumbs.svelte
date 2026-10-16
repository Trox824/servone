<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import type { BreadcrumbItem } from '../original'
  import { Label } from '../original'
  import { ChevronRight } from '@lucide/svelte'
  import Breadcrumb from './Breadcrumb.svelte'

  export let items: BreadcrumbItem[]
  export let afterLabel: IntlString | undefined = undefined
  export let size: 'large' | 'small' = 'large'
  export let selected: number | null = null
  export let currentOnly: boolean = false
  export let hideAfter: boolean = false

  const dispatch = createEventDispatcher<{ select: number }>()

  function activateSegment (segmentIndex: number): void {
    if (segmentIndex === selected) return
    dispatch('select', segmentIndex)
  }

  $: hasBadge = (afterLabel !== undefined || $$slots.afterLabel) && !hideAfter
</script>

<div class="flex items-center gap-1 min-w-0 {size === 'large' ? 'h-8' : 'h-6'}">
  {#each items as segment, segmentIndex}
    {#if segmentIndex > 0}
      <ChevronRight class="size-3.5 shrink-0 text-muted-foreground" />
    {/if}
    <Breadcrumb
      {...segment}
      {size}
      isCurrent={currentOnly || segmentIndex === selected}
      on:click={() => { activateSegment(segmentIndex) }}
    />
  {/each}
  {#if hasBadge}
    <span class="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase text-muted-foreground">
      {#if afterLabel !== undefined}<Label label={afterLabel} />{/if}
      <slot name="afterLabel" />
    </span>
  {/if}
</div>
