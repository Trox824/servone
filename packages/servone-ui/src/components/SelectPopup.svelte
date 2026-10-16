<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { translate } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { createEventDispatcher } from 'svelte'
  import {
    deviceOptionsStore,
    resizeObserver,
    createFocusManager,
    FocusHandler,
    ListView,
    Icon,
    Label,
    Spinner,
    IconCheck
  } from '../original'
  import type { SelectPopupValueType } from '../original'
  import MenuSearch from './MenuSearch.svelte'
  import uiPlugin from '@hcengineering/ui/src/plugin'
  import {
    menuPopupClass,
    menuItemClass,
    menuGroupLabelClass,
    menuSeparatorClass,
    menuCheckClass,
    menuScrollClass
  } from '../lib/menu-classes'

  export let placeholder: IntlString | undefined = undefined
  export let placeholderParam: any | undefined = undefined
  export let searchable: boolean = false
  export let value: SelectPopupValueType[]
  export let width: 'medium' | 'large' | 'full' = 'medium'
  export let size: 'small' | 'medium' | 'large' = 'small'
  export let onSelect: ((value: SelectPopupValueType['id'], event?: Event) => void) | undefined = undefined
  export let showShadow: boolean = true
  export let embedded: boolean = false
  export let componentLink: boolean = false
  export let loading: boolean = false
  export let search: string = ''

  const dispatch = createEventDispatcher<{
    close: SelectPopupValueType['id'] | undefined
    changeContent: undefined
    change: Event
  }>()

  const WIDTH_CLASSES = {
    medium: 'w-[16rem] max-w-[90vw]',
    large: 'w-[22rem] max-w-[90vw]',
    full: 'w-full'
  } satisfies Record<typeof width, string>

  const focusManager = createFocusManager()

  let menuElement: HTMLDivElement | undefined
  let listComponent: ListView | undefined
  let highlightedIndex = 0
  let lastChosenId: SelectPopupValueType['id'] | undefined
  let translatedLabels = new Map<IntlString, string>()

  $: translateAllLabels(value, $themeStore.language)

  async function translateAllLabels (entries: SelectPopupValueType[], language: string): Promise<void> {
    const labelIds = entries.map((entry) => entry.label).filter((labelId): labelId is IntlString => labelId !== undefined)
    const texts = await Promise.all(labelIds.map(async (labelId) => await translate(labelId, {}, language)))
    translatedLabels = new Map(labelIds.map((labelId, position) => [labelId, texts[position]]))
  }

  function displayText (entry: SelectPopupValueType, lookup: Map<IntlString, string>): string {
    if (entry.label !== undefined) {
      const translated = lookup.get(entry.label)
      if (translated !== undefined) return translated
    }
    return entry.text ?? ''
  }

  $: needle = search.toLowerCase()
  $: shownEntries = value.filter(
    (entry) => needle === '' || displayText(entry, translatedLabels).toLowerCase().includes(needle)
  )
  $: hasCheckColumn = value.some((entry) => entry.isSelected === true)
  $: placeholderId = placeholder ?? uiPlugin.string.SearchDots
  $: shouldAutoFocusSearch = !$deviceOptionsStore.isMobile

  $: if (menuElement !== undefined && !(searchable && shouldAutoFocusSearch)) menuElement.focus()

  function choose (entry: SelectPopupValueType): void {
    lastChosenId = entry.id
    if (onSelect !== undefined) {
      onSelect(entry.id)
    } else {
      dispatch('close', entry.id)
    }
  }

  function categoryLabelOf (entry: SelectPopupValueType | undefined): IntlString | undefined {
    return entry?.category?.label
  }

  function showsHeading (position: number, entries: SelectPopupValueType[]): boolean {
    const current = categoryLabelOf(entries[position])
    if (entries[position]?.category === undefined) return false
    if (position === 0) return current !== undefined
    return current !== categoryLabelOf(entries[position - 1])
  }

  export function onKeydown (key: KeyboardEvent): boolean {
    if (key.code === 'Tab') {
      dispatch('close', undefined)
      key.preventDefault()
      key.stopPropagation()
      return true
    }
    if (key.code === 'ArrowUp' || key.code === 'ArrowDown') {
      key.preventDefault()
      key.stopPropagation()
      listComponent?.select(highlightedIndex + (key.code === 'ArrowUp' ? -1 : 1))
      return true
    }
    if (key.code === 'Enter') {
      key.preventDefault()
      key.stopPropagation()
      const highlightedEntry = shownEntries[highlightedIndex]
      if (highlightedEntry !== undefined) choose(highlightedEntry)
      return true
    }
    return false
  }
</script>

<FocusHandler manager={focusManager} />

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  bind:this={menuElement}
  tabindex="0"
  class="{menuPopupClass} {WIDTH_CLASSES[width]}"
  class:shadow-none={!showShadow}
  use:resizeObserver={() => {
    dispatch('changeContent')
  }}
  on:keydown={onKeydown}
>
  {#if searchable}
    <MenuSearch
      bind:value={search}
      placeholder={placeholderId}
      {placeholderParam}
      autoFocus={shouldAutoFocusSearch}
      on:change
      on:input
      on:keydown
    />
  {/if}
  <div class={menuScrollClass}>
    <ListView
      bind:this={listComponent}
      kind={'full-size'}
      count={shownEntries.length}
      bind:selection={highlightedIndex}
      on:changeContent={() => {
        dispatch('changeContent')
      }}
    >
      <svelte:fragment slot="category" let:item>
        {@const headingEntry = shownEntries[item]}
        {#if headingEntry !== undefined && showsHeading(item, shownEntries)}
          {#if item !== 0}
            <div class={menuSeparatorClass}></div>
          {/if}
          <div class={menuGroupLabelClass}>
            <span class="truncate">
              <Label label={headingEntry.category?.label ?? ''} />
            </span>
          </div>
        {/if}
      </svelte:fragment>
      <svelte:fragment slot="item" let:item>
        {@const rowEntry = shownEntries[item]}
        {#if rowEntry !== undefined}
          <button
            type="button"
            class={menuItemClass}
            disabled={loading}
            on:click={() => {
              choose(rowEntry)
            }}
          >
            {#if rowEntry.component}
              <div class="min-w-0 flex-1" class:pointer-events-none={!componentLink}>
                <svelte:component this={rowEntry.component} {...rowEntry.props} />
              </div>
            {:else}
              {#if rowEntry.icon}
                <Icon icon={rowEntry.icon} iconProps={rowEntry.iconProps} fill={rowEntry.iconColor ?? 'currentColor'} {size} />
              {/if}
              <span class="flex-1 truncate text-left" class:text-base={size === 'medium' || size === 'large'}>
                {#if rowEntry.label}
                  <Label label={rowEntry.label} />
                {:else}
                  {rowEntry.text}
                {/if}
              </span>
            {/if}
            {#if hasCheckColumn}
              <span class={menuCheckClass}>
                {#if rowEntry.isSelected === true}
                  <Icon icon={IconCheck} size={'small'} />
                {/if}
              </span>
            {/if}
            {#if loading && rowEntry.id === lastChosenId}
              <Spinner size={'small'} />
            {/if}
          </button>
        {/if}
      </svelte:fragment>
    </ListView>
  </div>
</div>
