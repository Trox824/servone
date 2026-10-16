<script lang="ts">
  import type { Doc, Ref } from '@hcengineering/core'
  import { createEventDispatcher } from 'svelte'
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { getEmbeddedLabel, translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import type { AnyComponent, IconSize, AnySvelteComponent } from '../original'
  import {
    showPopup,
    type Action,
    Label,
    Component,
    IconFolderCollapsed,
    IconFolderExpanded,
    Icon,
    getTreeCollapsed,
    setTreeCollapsed,
    tooltip
  } from '../original'
  import { ChevronDown, Ellipsis } from '@lucide/svelte'
  import { cn } from '../lib/utils'
  import Menu from './Menu.svelte'

  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let folderIcon: boolean = false
  export let iconProps: Record<string, string | number | boolean | undefined> | undefined = undefined
  export let iconSize: IconSize = 'small'
  export let label: IntlString | undefined = undefined
  export let title: string | undefined = undefined
  export let categoryName: string
  export let tools: AnyComponent | undefined = undefined
  export let isOpen: boolean = true
  export let isFold: boolean = false
  export let empty: boolean = false
  export let collapsedPrefix: string = ''
  export let visible: boolean = false
  export let highlighted: boolean = false
  export let selected: boolean = false
  export let type: 'default' | 'nested' | 'nested-selectable' | 'selectable-header' = 'default'
  export let noDivider: boolean = false
  export let showMenu: boolean = false
  export let shouldTooltip: boolean = false
  export let forciblyСollapsed: boolean = false
  export let draggable: boolean = false
  export let actions: Action[] = []
  export let _id: Ref<Doc> | string | undefined = undefined

  const dispatch = createEventDispatcher()
  const MORE_ACTIONS_LABEL = 'view:string:MoreActions' as IntlString

  let isPressed = false
  let actionsButton: HTMLButtonElement | undefined
  let sectionLabel = ''
  let actionsAriaLabel = ''

  $: isOpen = !getTreeCollapsed(_id, collapsedPrefix)
  $: setTreeCollapsed(_id, !isOpen, collapsedPrefix)

  $: shownIcon = folderIcon ? (isOpen && !empty ? IconFolderExpanded : IconFolderCollapsed) : icon
  $: singlePlainAction = actions.length === 1 && actions[0].component === undefined ? actions[0] : undefined
  $: language = $themeStore.language

  $: translateCB(label ?? getEmbeddedLabel(title ?? categoryName), {}, language, (text) => {
    sectionLabel = text
  })
  $: if (actions.length > 0) {
    translateCB(
      singlePlainAction !== undefined ? singlePlainAction.label : MORE_ACTIONS_LABEL,
      singlePlainAction?.labelParams ?? {},
      language,
      (text) => {
        actionsAriaLabel = text
      }
    )
  }

  $: titleTooltip = shouldTooltip
    ? { label: label ?? getEmbeddedLabel(title ?? ''), direction: 'top' as const }
    : undefined
  $: actionTooltip =
    singlePlainAction !== undefined
      ? { label: singlePlainAction.label, props: singlePlainAction.labelParams, direction: 'bottom' as const }
      : undefined

  $: isRevealed = showMenu || isPressed
  $: isContentExpanded = isOpen || visible
  $: showVisibleSlot = (!isOpen && visible) || forciblyСollapsed
  $: isNested = type === 'nested' || type === 'nested-selectable'
  $: hasToolsArea = tools !== undefined || $$slots.tools

  function flipOpen (): void {
    isOpen = !isOpen
    dispatch('toggle', isOpen)
  }

  function onChevronClick (event: MouseEvent): void {
    event.stopPropagation()
    event.preventDefault()
    flipOpen()
  }

  function onBodyClick (event: MouseEvent): void {
    if (type === 'selectable-header') {
      dispatch('click')
    } else if (type === 'nested-selectable' && (!selected || empty)) {
      dispatch('click')
    } else if (!empty) {
      event.stopPropagation()
      flipOpen()
    }
  }

  function onActionsClick (event: MouseEvent): void {
    event.stopPropagation()
    event.preventDefault()
    if (singlePlainAction !== undefined) {
      void singlePlainAction.action(undefined, event)
      return
    }
    if (actionsButton === undefined) return
    isPressed = true
    showPopup(Menu, { actions }, actionsButton, () => {
      isPressed = false
    })
  }

  const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const revealedArea = (revealed: boolean): string =>
    cn('items-center gap-1', revealed ? 'flex' : 'hidden group-hover/navrow:flex')
</script>

<div class={cn('flex min-w-0 shrink-0 flex-col', type === 'default' && !noDivider && 'mt-3 border-t border-border pt-2')}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class={cn(
      'group/navrow my-0.5 flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm font-medium',
      isNested ? 'ml-3 mr-2 text-sidebar-foreground' : 'mx-2 text-muted-foreground',
      selected ? 'bg-sidebar-accent text-foreground' : 'hover:bg-sidebar-accent',
      highlighted && 'text-foreground'
    )}
    data-selected={selected || isPressed}
    {draggable}
    on:dragstart
    on:dragover
    on:dragend
    on:drop
  >
    {#if isFold && !empty}
      <button
        type="button"
        class={cn('flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground', focusRing)}
        aria-expanded={isOpen}
        aria-label={sectionLabel}
        on:click={onChevronClick}
      >
        <ChevronDown class={cn('size-3.5 transition-transform', !isOpen && '-rotate-90')} />
      </button>
    {/if}

    <button
      type="button"
      class={cn('flex h-full min-w-0 flex-1 items-center justify-start gap-1.5 rounded-md text-left', focusRing)}
      on:click={onBodyClick}
    >
      {#if shownIcon !== undefined}
        <span class="flex size-4 shrink-0 items-center justify-center">
          <Icon icon={shownIcon} size={iconSize} {iconProps} />
        </span>
      {/if}
      <span class="min-w-0 truncate" use:tooltip={titleTooltip}>
        {#if label !== undefined}<Label {label} />{/if}
        {#if title !== undefined}{title}{/if}
      </span>
    </button>

    <slot name="extra" />

    {#if actions.length > 0}
      <button
        bind:this={actionsButton}
        type="button"
        class={cn(
          'size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/7 hover:text-foreground',
          isPressed && 'bg-foreground/7 text-foreground',
          isRevealed ? 'flex' : 'hidden group-hover/navrow:flex',
          focusRing
        )}
        aria-label={actionsAriaLabel}
        use:tooltip={actionTooltip}
        on:click={onActionsClick}
      >
        {#if singlePlainAction?.icon !== undefined}
          <Icon icon={singlePlainAction.icon} size="small" />
        {:else}
          <Ellipsis class="size-4" />
        {/if}
      </button>
    {/if}

    {#if hasToolsArea}
      <div class={revealedArea(isRevealed)}>
        {#if tools !== undefined}
          <Component is={tools} props={{ kind: 'tools', categoryName }} />
        {/if}
        <slot name="tools" />
      </div>
    {/if}

    {#if $$slots.actions}
      <div class={revealedArea(isRevealed)}>
        <slot name="actions" />
      </div>
    {/if}
  </div>

  {#if !empty}
    <div
      id={'navGroup-' + categoryName}
      role="list"
      class={cn('flex min-h-0 min-w-0 flex-col overflow-hidden [&_button[data-selected]]:pl-8', isContentExpanded ? 'max-h-full' : 'max-h-0')}
    >
      {#if showVisibleSlot}
        <slot name="visible" {isOpen} />
      {:else}
        <slot />
      {/if}
    </div>
  {/if}
</div>
