<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { translate, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import type { TabItem, IconSize, WidthType, DropdownIntlItem } from '../original'
  import { Icon, Label, Scroller, checkAdaptiveMatching, deviceOptionsStore, tooltip } from '../original'
  import DropdownLabelsIntl from './DropdownLabelsIntl.svelte'
  import { cn } from '../lib/utils'

  export let selected: string | number | Array<string | number> = ''
  export let multiselect: boolean = false
  export let items: TabItem[]
  export let kind: 'normal' | 'regular' | 'plain' | 'separated' | 'separated-free' = 'normal'
  export let expansion: 'stretch' | 'default' = 'default'
  export let onlyIcons: boolean = false
  export let size: 'small' | 'medium' = 'medium'
  export let adaptiveShrink: WidthType | null = null
  export let padding: string | undefined = undefined
  export let bottomPadding: string | undefined = undefined

  const dispatch = createEventDispatcher<{ select: TabItem }>()

  if (multiselect) {
    if (selected === '') selected = []
  } else if (selected === '' && items.length > 0) {
    selected = items[0].id
  }

  let tooltipTexts: Record<string, string> = {}

  async function refreshTooltipTexts (tabs: TabItem[], language: string): Promise<void> {
    const entries = await Promise.all(
      tabs
        .filter((tab) => tab.tooltip !== undefined)
        .map(async (tab): Promise<[string, string]> => [String(tab.id), await translate(tab.tooltip as IntlString, {}, language)])
    )
    tooltipTexts = Object.fromEntries(entries)
  }

  $: void refreshTooltipTexts(items, $themeStore.language)

  $: isCollapsed = adaptiveShrink !== null && checkAdaptiveMatching($deviceOptionsStore.size, adaptiveShrink)
  $: isPillLook = kind === 'normal' || kind === 'regular'
  $: dropdownItems = items.map((tab): DropdownIntlItem => ({
    id: tab.id,
    label: tab.labelIntl as IntlString,
    params: tab.labelParams
  }))
  $: dropdownSelected = Array.isArray(selected) ? selected[0] : selected

  function isTabSelected (tabId: string | number, current: string | number | Array<string | number>): boolean {
    return multiselect && Array.isArray(current) ? current.includes(tabId) : current === tabId
  }

  function pickTab (tab: TabItem): void {
    if (multiselect && Array.isArray(selected)) {
      selected = selected.includes(tab.id) ? selected.filter((entry) => entry !== tab.id) : [...selected, tab.id]
    } else {
      selected = tab.id
    }
    dispatch('select', tab)
  }

  function pickFromDropdown (event: CustomEvent<string | number>): void {
    const pickedTab = items.find((tab) => tab.id === event.detail)
    if (pickedTab === undefined) return
    if (Array.isArray(selected)) {
      selected[0] = pickedTab.id
      selected = selected
    } else {
      selected = pickedTab.id
    }
    dispatch('select', pickedTab)
  }

  function iconSizeFor (): IconSize {
    if (onlyIcons) return size === 'small' ? 'small' : 'medium'
    return size === 'small' ? 'x-small' : 'small'
  }

  function tooltipOn (node: HTMLElement, label: IntlString | undefined): { update: (next: IntlString | undefined) => void, destroy: () => void } {
    const handle = tooltip(node, { label, element: node })
    return {
      update: (next) => handle?.update?.({ label: next, element: node }),
      destroy: () => handle?.destroy?.()
    }
  }
</script>

{#if items.length > 0}
  {#if isCollapsed}
    <DropdownLabelsIntl items={dropdownItems} {size} selected={dropdownSelected} on:selected={pickFromDropdown} />
  {:else}
    <Scroller horizontal stickedScrollBars {padding} {bottomPadding}>
      <div
        class={cn(
          'flex items-center gap-1',
          expansion === 'stretch' ? 'w-full' : 'w-fit',
          isPillLook ? 'rounded-md bg-muted p-1' : 'border-b border-border'
        )}
      >
        {#each items as tab (tab.id)}
          {@const isActive = isTabSelected(tab.id, selected)}
          {@const hasText = tab.label !== undefined || tab.labelIntl !== undefined}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            data-id={'tab-' + tab.id}
            data-view={tab.tooltip}
            aria-label={!hasText && tab.tooltip !== undefined ? tooltipTexts[String(tab.id)] : undefined}
            use:tooltipOn={tab.tooltip}
            class={cn(
              'flex items-center justify-center gap-1.5 rounded-sm font-medium whitespace-nowrap',
              size === 'small' ? 'h-6 text-xs' : 'h-7 text-sm',
              onlyIcons ? 'px-1.5' : 'px-2.5',
              expansion === 'stretch' && 'flex-1',
              isPillLook
                ? isActive
                  ? 'cursor-default bg-background text-foreground shadow-sm'
                  : 'cursor-pointer text-muted-foreground hover:text-foreground'
                : isActive
                  ? 'translate-y-px cursor-default rounded-none border-b-2 border-primary text-foreground'
                  : 'cursor-pointer rounded-none border-b-2 border-transparent text-muted-foreground hover:text-foreground'
            )}
            on:click={() => pickTab(tab)}
          >
            {#if tab.icon}
              <div class="shrink-0">
                <Icon icon={tab.icon} size={iconSizeFor()} fill={tab.color ?? 'currentColor'} />
              </div>
            {:else if tab.color}
              <div class="size-2 shrink-0 rounded-[2px]" style:background-color={tab.color}></div>
            {/if}
            {#if tab.label}
              <span class="truncate">{tab.label}</span>
            {:else if tab.labelIntl}
              <span class="truncate"><Label label={tab.labelIntl} params={tab.labelParams} /></span>
            {/if}
          </div>
        {/each}
      </div>
    </Scroller>
  {/if}
{/if}
