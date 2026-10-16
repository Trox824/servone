<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import {
    Icon,
    Label,
    type AnySvelteComponent,
    type IconSize,
    getTreeCollapsed,
    setTreeCollapsed,
    tooltip,
    IconFolderExpanded,
    IconFolderCollapsed
  } from '../original'
  import { cn } from '../lib/utils'
  import { ChevronDown } from '@lucide/svelte'

  type RowType = 'type-link' | 'type-tag' | 'type-anchor-link' | 'type-object'
  type IconProps = Record<string, string | number | boolean | undefined>

  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let folderIcon: boolean = false
  export let iconProps: IconProps | undefined = undefined
  export let iconSize: IconSize = 'small'
  export let label: IntlString | undefined = undefined
  export let title: string | undefined = undefined
  export let description: string | undefined = undefined
  export let type: RowType = 'type-link'
  export let color: string | null = null
  export let count: number | null = null
  export let selected: boolean = false
  export let indent: boolean = false
  export let bold: boolean = false
  export let disabled: boolean = false
  export let isFold: boolean = false
  export let isOpen: boolean = false
  export let withBackground: boolean = false
  export let showMenu: boolean = false
  export let shouldTooltip: boolean = false
  export let empty: boolean = false
  export let collapsedPrefix: string = ''
  export let visible: boolean = false
  export let forciblyСollapsed: boolean = false
  export let level: number = 0
  export let _id: string | undefined = undefined
  export let draggable: boolean = false

  const paddingByType: Record<RowType, string> = {
    'type-link': 'pl-3 pr-1.5',
    'type-tag': 'px-3',
    'type-object': 'pl-2 pr-1.5',
    'type-anchor-link': 'w-fit px-3'
  }
  const NARROW_LABEL_PX = 16

  let labelArea: HTMLElement | undefined
  let isHovered = false
  let isIndentReset = false

  $: isOpen = !getTreeCollapsed(_id, collapsedPrefix)
  $: setTreeCollapsed(_id, !isOpen, collapsedPrefix)

  $: displayedIcon = folderIcon ? (isOpen && !empty ? IconFolderExpanded : IconFolderCollapsed) : icon
  $: hasIconBox = displayedIcon !== undefined || (type === 'type-tag' && color !== null)
  $: isColoredTag = type === 'type-tag' && selected && color !== null
  $: labelColor = isColoredTag ? color : null
  $: hasDescription = description !== undefined && description !== ''
  $: showsNested = (isFold && (isOpen || visible) && !empty) || forciblyСollapsed
  $: showsVisibleSlot = (!isOpen && visible) || forciblyСollapsed
  $: areActionsRendered = showMenu || $$slots.actions
  $: labelTooltip = shouldTooltip ? { label: label ?? getEmbeddedLabel(title ?? ''), direction: 'top' as const } : undefined
  $: if (!showMenu && !isHovered) isIndentReset = false

  function flipOpen (): void {
    isOpen = !isOpen
  }

  function onRowClick (): void {
    if (selected && isFold) flipOpen()
  }

  function onChevronClick (event: MouseEvent): void {
    event.stopPropagation()
    if (!empty) flipOpen()
  }

  function onChevronKeydown (event: KeyboardEvent): void {
    event.stopPropagation()
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (!empty) flipOpen()
  }

  function onPointerEnter (): void {
    isHovered = true
    const labelWidth = labelArea?.getBoundingClientRect().width ?? NARROW_LABEL_PX
    isIndentReset = level > 0 && labelWidth < NARROW_LABEL_PX
  }

  function onPointerLeave (): void {
    isHovered = false
  }
</script>

<button
  type="button"
  class={cn(
    'group/row flex h-8 min-w-0 w-[calc(100%-1rem)] shrink-0 items-center gap-2 mx-2 my-0.5 rounded-md text-left text-sidebar-foreground',
    type === 'type-anchor-link' ? 'text-xs' : 'text-sm',
    paddingByType[type],
    indent && 'pl-8',
    selected ? 'cursor-default bg-sidebar-accent' : 'hover:bg-sidebar-accent',
    disabled ? 'cursor-not-allowed opacity-50' : !selected && 'cursor-pointer'
  )}
  data-selected={selected}
  {draggable}
  on:click={onRowClick}
  on:click
  on:contextmenu
  on:dragstart
  on:dragover
  on:dragend
  on:drop
  on:mouseenter={onPointerEnter}
  on:mouseleave={onPointerLeave}
>
  {#if isFold}
    <span
      role="button"
      tabindex="0"
      class={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-transform',
        !isOpen && '-rotate-90',
        empty && 'pointer-events-none'
      )}
      style:margin-left={isIndentReset ? '0' : `${level * 1.25}rem`}
      on:click={onChevronClick}
      on:keydown={onChevronKeydown}
    >
      {#if !empty}
        <ChevronDown class="size-3.5" />
      {/if}
    </span>
  {/if}

  {#if hasIconBox}
    <span
      class={cn(
        'relative flex min-h-4 min-w-4 shrink-0 items-center justify-center text-foreground',
        withBackground && 'size-6 rounded-md border bg-muted'
      )}
    >
      {#if $$slots.icon}
        <slot name="icon" />
      {:else if type !== 'type-tag' && displayedIcon}
        <Icon icon={displayedIcon} size={iconSize} {iconProps} />
      {:else if type === 'type-tag' && color}
        <span class="size-2.5 rounded-sm" style:background-color={color}></span>
      {/if}
    </span>
  {/if}

  <span
    bind:this={labelArea}
    class={cn(
      'min-w-0',
      type !== 'type-anchor-link' && 'grow',
      hasDescription ? 'flex items-baseline gap-1.5' : 'truncate',
      bold && 'font-semibold'
    )}
    style:color={labelColor}
    use:tooltip={labelTooltip}
  >
    <span
      class={hasDescription ? 'shrink-0 text-xs font-medium text-muted-foreground' : 'contents'}
      style:color={labelColor}
    >
      {#if label}<Label {label} />{/if}
      {#if title}{title}{/if}
      <slot />
    </span>
    {#if hasDescription}
      <span class="truncate">{description}</span>
    {/if}
  </span>

  <slot name="extra" />

  {#if areActionsRendered}
    <span
      class={cn(
        'hidden shrink-0 items-center gap-0.5 group-hover/row:flex',
        showMenu && 'flex'
      )}
    >
      <slot name="actions" />
    </span>
  {/if}

  {#if count !== null}
    <span class="px-2 text-xs font-semibold text-muted-foreground">{count}</span>
  {/if}

  <slot name="notify" />
</button>

{#if showsNested}
  <div class="flex min-h-0 min-w-0 flex-col">
    {#if showsVisibleSlot}
      <slot name="visible" {isOpen} />
    {:else}
      <slot name="dropbox" />
    {/if}
  </div>
{/if}
