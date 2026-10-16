<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { ExpandCollapse, Icon, Label } from '../original'
  import { ChevronRight } from '@lucide/svelte'
  import { cn } from '../lib/utils'

  export let icon: Asset | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let expanded: boolean = false
  export let bordered: boolean = false
  export let expandable: boolean = true
  export let contentColor: boolean = false
  export let showChevron: boolean = true

  let hasBeenExpanded = expanded
  $: if (expanded) hasBeenExpanded = true

  function toggleSection (event: MouseEvent): void {
    event.stopPropagation()
    if (expandable) expanded = !expanded
  }
</script>

<div class="flex flex-col">
  <div
    class={cn(
      'flex items-center justify-between',
      expanded && 'mb-3',
      bordered && 'rounded-md border border-border bg-muted px-2 py-1'
    )}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class={cn('mr-4 flex items-center gap-2', expandable && 'cursor-pointer')} on:click={toggleSection}>
      <ChevronRight
        class={cn(
          'size-4 shrink-0 text-muted-foreground transition-transform duration-150',
          expanded && 'rotate-90',
          !showChevron && 'invisible'
        )}
      />
      {#if icon}
        <div class="min-w-4 text-muted-foreground">
          <Icon {icon} size="small" />
        </div>
      {/if}
      <span class={cn('overflow-label text-sm font-medium', contentColor ? 'text-muted-foreground' : 'text-foreground')}>
        {#if label}<Label {label} />{/if}
        <slot name="title" />
      </span>
      {#if $$slots['title-tools']}
        <div class="flex items-center gap-1">
          <slot name="title-tools" />
        </div>
      {/if}
    </div>
    {#if $$slots.tools}
      <div class="flex items-center gap-1">
        <slot name="tools" />
      </div>
    {/if}
  </div>
  <ExpandCollapse isExpanded={expanded}>
    {#if hasBeenExpanded}
      <slot />
    {/if}
  </ExpandCollapse>
</div>
