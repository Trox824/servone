<script lang="ts">
  import { Label, resolvedLocationStore } from '@hcengineering/ui'
  import type { Viewlet } from '@hcengineering/view'
  import { Check } from '@lucide/svelte'
  import { createEventDispatcher } from 'svelte'
  import { cn } from '../../../lib/utils'
  import { isTrackerOnlyColumn, workflowColumnLabel } from '../../tracker-resources/components/issues/workflowItem'
  import { WORKFLOW_APP_ALIAS } from '../../tracker-resources/workflows/plugin'
  import { type AttributeConfig, type Config, isAttribute } from '../viewOptions'

  export let viewlet: Viewlet
  export let items: Array<Config | AttributeConfig> = []

  const dispatch = createEventDispatcher()

  let chipElements: Array<HTMLButtonElement | undefined> = []
  let draggedPosition: number | undefined

  $: isWorkflowMode = $resolvedLocationStore.path[2] === WORKFLOW_APP_ALIAS

  function isChipHidden (entry: AttributeConfig, workflowMode: boolean): boolean {
    return workflowMode && isTrackerOnlyColumn(entry.value, entry.label)
  }

  function toggleEntry (entry: AttributeConfig): void {
    entry.enabled = !entry.enabled
    items = items
    dispatch('save', items)
  }

  function canDrag (entry: AttributeConfig): boolean {
    return Boolean(viewlet.configOptions?.sortable) && entry.enabled
  }

  function onDragStart (event: DragEvent, position: number): void {
    if (event.dataTransfer != null) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.dropEffect = 'move'
    }
    event.stopPropagation()
    draggedPosition = position
  }

  function onDragOver (event: DragEvent, hoveredPosition: number): void {
    event.preventDefault()
    event.stopPropagation()
    const sourcePosition = draggedPosition
    const hoveredChip = chipElements[hoveredPosition]
    if (sourcePosition === undefined || hoveredChip === undefined || hoveredPosition === sourcePosition) return
    const halfWidth = hoveredChip.offsetWidth / 2
    const hasCrossedMiddle = hoveredPosition < sourcePosition ? event.offsetX < halfWidth : event.offsetX > halfWidth
    if (!hasCrossedMiddle) return
    const hoveredEntry = items[hoveredPosition]
    items[hoveredPosition] = items[sourcePosition]
    items[sourcePosition] = hoveredEntry
    items = items
    draggedPosition = hoveredPosition
  }

  function onDragEnd (): void {
    draggedPosition = undefined
    dispatch('save', items)
  }
</script>

<div class="flex flex-wrap items-center gap-1.5">
  {#each items as entry, position}
    {#if isAttribute(entry)}
      {#if !isChipHidden(entry, isWorkflowMode)}
        <button
          bind:this={chipElements[position]}
          type="button"
          aria-pressed={entry.enabled}
          draggable={canDrag(entry)}
          class={cn(
            'inline-flex h-7 max-w-full items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            entry.enabled
              ? 'border-primary/40 bg-primary/15 pl-1.5 text-foreground hover:bg-primary/25'
              : 'border-dashed border-foreground/25 bg-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground',
            draggedPosition === position && 'opacity-50'
          )}
          on:click={() => {
            toggleEntry(entry)
          }}
          on:dragstart={(event) => {
            onDragStart(event, position)
          }}
          on:dragover={(event) => {
            onDragOver(event, position)
          }}
          on:dragend={onDragEnd}
        >
          {#if entry.enabled}
            <Check size={12} class="shrink-0 text-primary" aria-hidden="true" />
          {/if}
          <span class="truncate">
            <Label label={isWorkflowMode ? workflowColumnLabel(entry.label) : entry.label} />
          </span>
        </button>
      {/if}
    {:else}
      <div class="basis-full"></div>
    {/if}
  {/each}
</div>
