<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import { generateId, type Doc, type Ref } from '@hcengineering/core'
  import { closePopup, showPopup, resizeObserver, Icon, Label, type Action } from '../original'
  import ui from '@hcengineering/ui/src/plugin'
  import MouseSpeedTracker from '@hcengineering/ui/src/components/MouseSpeedTracker.svelte'
  import { ChevronRight } from '@lucide/svelte'
  import { menuPopupClass, menuItemClass, menuSeparatorClass } from '../lib/menu-classes'
  import { cn } from '../lib/utils'

  export let actions: Action[] = []
  export let ctx: Parameters<Action['action']>[0] = undefined
  export let popupCategory: Ref<Doc> | undefined = undefined
  export let addClass: string | undefined = undefined

  const dispatch = createEventDispatcher<{
    close: undefined
    update: 'left' | 'right' | undefined
    changeContent: undefined
  }>()

  const ownCategory: string = popupCategory ?? generateId()
  const submenuCategory: string = generateId()

  let highlightedIndex: number | undefined = undefined
  let isPointerSlow = false
  let rowButtons: HTMLButtonElement[] = []
  let scrollBox: HTMLDivElement | undefined = undefined

  function isSubmenuRow (action: Action): boolean {
    return action.component !== undefined && action.isSubmenuRightClicking !== true
  }

  function closeOwnSubmenus (): void {
    closePopup(ownCategory)
  }

  function openSubmenu (action: Action, rowButton: HTMLElement, isShownSuppressed: boolean): void {
    closePopup(ownCategory)
    closePopup(submenuCategory)
    if (action.component === undefined || isShownSuppressed) return
    showPopup(
      action.component,
      { ...action.props, popupCategory: submenuCategory },
      { getBoundingClientRect: () => rowButton.getBoundingClientRect(), kind: 'submenu' },
      () => {
        dispatch('close')
      },
      undefined,
      { category: ownCategory, overlay: false }
    )
  }

  function activateRow (index: number, action: Action, isShownSuppressed: boolean): void {
    if (!isPointerSlow || highlightedIndex === index) return
    highlightedIndex = index
    openSubmenu(action, rowButtons[index], isShownSuppressed)
  }

  function handleRowMove (index: number, action: Action): void {
    const isRightClickOnly = action.link === undefined && action.isSubmenuRightClicking === true
    activateRow(index, action, isRightClickOnly)
  }

  async function handleRowClick (index: number, action: Action, event: MouseEvent): Promise<void> {
    if (action.link !== undefined) {
      event.preventDefault()
      event.stopPropagation()
    } else if (isSubmenuRow(action)) {
      activateRow(index, action, false)
      return
    }
    if (action.inline !== true) dispatch('close')
    await action.action(ctx, event)
  }

  function handleRowContextMenu (index: number, action: Action, event: MouseEvent): void {
    if (action.link !== undefined || isSubmenuRow(action) || action.component === undefined) return
    event.preventDefault()
    openSubmenu(action, rowButtons[index], false)
  }

  function handleKeydown (event: KeyboardEvent): void {
    const lastIndex = actions.length - 1
    switch (event.key) {
      case 'Tab':
        dispatch('close')
        break
      case 'ArrowDown':
        highlightedIndex = highlightedIndex === undefined ? 0 : Math.min(highlightedIndex + 1, lastIndex)
        break
      case 'ArrowUp':
        if (highlightedIndex !== undefined) highlightedIndex = Math.max(highlightedIndex - 1, 0)
        break
      case 'ArrowLeft':
        dispatch('update', 'left')
        closeOwnSubmenus()
        break
      case 'ArrowRight':
        dispatch('update', 'right')
        if (highlightedIndex !== undefined) {
          openSubmenu(actions[highlightedIndex], rowButtons[highlightedIndex], false)
        }
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  export function clearFocus (): void {
    closeOwnSubmenus()
    highlightedIndex = undefined
  }

  onMount(() => {
    dispatch('update', undefined)
    rowButtons[0]?.focus()
    scrollBox?.focus()
  })

  onDestroy(closeOwnSubmenus)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={cn(menuPopupClass, addClass)}
  use:resizeObserver={() => {
    dispatch('changeContent')
  }}
  on:keydown={handleKeydown}
>
  <MouseSpeedTracker bind:focusSpeed={isPointerSlow} />
  <slot name="header" />
  <div class="max-h-96 overflow-y-auto overflow-x-hidden outline-none" tabindex="-1" bind:this={scrollBox}>
    {#each actions as action, index}
      {#if index > 0 && action.group !== actions[index - 1].group}
        <div class={menuSeparatorClass}></div>
      {/if}
      {#if action.link !== undefined}
        <a href={action.link} class="block text-inherit no-underline">
          <button
            type="button"
            class={cn(menuItemClass, highlightedIndex === index && 'bg-accent')}
            bind:this={rowButtons[index]}
            on:mousemove={() => {
              handleRowMove(index, action)
            }}
            on:click={(event) => handleRowClick(index, action, event)}
          >
            {#if action.icon}
              <Icon icon={action.icon} size={'small'} />
            {/if}
            <span class="min-w-0 flex-1 truncate text-left">
              <Label label={action.label} params={action.labelParams ?? {}} />
            </span>
          </button>
        </a>
      {:else}
        <button
          type="button"
          class={cn(menuItemClass, highlightedIndex === index && 'bg-accent')}
          bind:this={rowButtons[index]}
          on:mousemove={() => {
            handleRowMove(index, action)
          }}
          on:click={(event) => handleRowClick(index, action, event)}
          on:contextmenu={(event) => {
            handleRowContextMenu(index, action, event)
          }}
        >
          {#if action.icon}
            <Icon icon={action.icon} size={'small'} />
          {/if}
          <span class="min-w-0 flex-1 truncate text-left">
            <Label label={action.label} params={action.labelParams ?? {}} />
          </span>
          {#if isSubmenuRow(action)}
            <ChevronRight size={14} class="shrink-0 text-muted-foreground" />
          {/if}
        </button>
      {/if}
    {:else}
      <div class="px-2 py-3 text-sm text-destructive">
        <Label label={ui.string.NoActionsDefined} />
      </div>
    {/each}
  </div>
</div>
