<script lang="ts">
  import { SortingOrder } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import type { IntlString } from '@hcengineering/platform'
  import { type DropdownIntlItem, DropdownLabelsIntl, Label, resolvedLocationStore, tooltip } from '@hcengineering/ui'
  import type { ViewOptionModel, ViewOptions, ViewOptionsModel, Viewlet } from '@hcengineering/view'
  import { ArrowDownWideNarrow, ArrowUpNarrowWide } from '@lucide/svelte'
  import { createEventDispatcher } from 'svelte'
  import { menuPopupClass } from '../../../lib/menu-classes'
  import { buttonVariants } from '../../../lib/components/ui/button'
  import { cn } from '../../../lib/utils'
  import { intl } from '../../../lib/intl'
  import { workflowColumnLabel } from '../../tracker-resources/components/issues/workflowItem'
  import { WORKFLOW_APP_ALIAS } from '../../tracker-resources/workflows/plugin'
  import { Switch } from '../../../lib/components/ui/switch'
  import view from '../plugin'
  import { buildConfigLookup, canResolveAttribute, getKeyLabel } from '../utils'
  import { isDropdownType, isToggleType, noCategory } from '../viewOptions'

  export let viewlet: Viewlet
  export let config: ViewOptionsModel
  export let viewOptions: ViewOptions
  export let hideGroupingAndOrdering: boolean = false
  export let hideKeys: string[] = []
  export let embedded: boolean = false

  const MANUAL_ORDER_KEY = 'rank'
  const invertedToggleLabels = new Map<string, IntlString>([['hideArchived', 'view:string:ServoneShowArchived' as IntlString]])
  const ascendingLabel = 'view:string:ServoneAscending' as IntlString
  const descendingLabel = 'view:string:ServoneDescending' as IntlString

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()

  const attributeLookup = buildConfigLookup(hierarchy, viewlet.attachTo, viewlet.config, viewlet.options?.lookup)

  const groupingChoices: DropdownIntlItem[] = [
    ...config.groupBy
      .filter((key) => canResolveAttribute(hierarchy, viewlet.attachTo, key, attributeLookup))
      .map((key) => ({ id: key, label: getKeyLabel(client, viewlet.attachTo, key, attributeLookup) })),
    { id: noCategory, label: view.string.NoGrouping }
  ]

  const orderingChoices: DropdownIntlItem[] = config.orderBy
    .filter(([key]) => key === MANUAL_ORDER_KEY || canResolveAttribute(hierarchy, viewlet.attachTo, key, attributeLookup))
    .map(([key]) => ({
      id: key,
      label: key === MANUAL_ORDER_KEY ? view.string.Manual : getKeyLabel(client, viewlet.attachTo, key, attributeLookup)
    }))

  function buildInitialLevels (): string[] {
    const levels = [...viewOptions.groupBy]
    const lastLevel = levels[levels.length - 1]
    if (lastLevel !== noCategory && levels.length !== config.groupDepth) levels.push(noCategory)
    return levels
  }

  let groupLevels: string[] = buildInitialLevels()

  $: hasGroupingChoice = config.groupBy.filter((key) => key !== undefined && key !== null && key !== '').length > 1
  $: isGroupingShown = !hideGroupingAndOrdering && hasGroupingChoice
  $: isOrderingShown = !hideGroupingAndOrdering && config.orderBy.length > 1
  $: shownOptions = config.other.filter((option) => isOptionShown(option, viewOptions, hideKeys))
  $: isDividerShown = shownOptions.length > 0 && (isGroupingShown || isOrderingShown)
  $: isWorkflowMode = $resolvedLocationStore.path[2] === WORKFLOW_APP_ALIAS
  $: [orderKey, orderDirection] = viewOptions.orderBy ?? []
  $: isDirectionShown = orderKey !== undefined && orderKey !== MANUAL_ORDER_KEY
  $: isDescending = orderDirection === SortingOrder.Descending
  $: directionLabel = intl(isDescending ? descendingLabel : ascendingLabel)

  function isOptionShown (option: ViewOptionModel, currentOptions: ViewOptions, hiddenKeys: string[]): boolean {
    if (option.hidden?.(currentOptions) === true) return false
    if (hiddenKeys.includes(option.key)) return false
    if (option.dependsOn !== undefined && option.dependsOn !== null) {
      return currentOptions[option.dependsOn] === true
    }
    return true
  }

  function choicesForLevel (levelPosition: number, currentGroupBy: string[]): DropdownIntlItem[] {
    const usedKeys = currentGroupBy.slice(0, levelPosition)
    return groupingChoices.filter((choice) => !usedKeys.includes(String(choice.id)))
  }

  function pickGrouping (levelPosition: number, pickedKey: string): void {
    let nextLevels = [...groupLevels]
    nextLevels[levelPosition] = pickedKey
    if (pickedKey === noCategory) {
      nextLevels = nextLevels.slice(0, levelPosition + 1)
    } else if (config.groupDepth === undefined || config.groupDepth > viewOptions.groupBy.length) {
      nextLevels = [...nextLevels.slice(0, levelPosition + 1), noCategory]
    }
    groupLevels = nextLevels
    viewOptions.groupBy = nextLevels.length > 1 ? nextLevels.filter((key) => key !== noCategory) : [...nextLevels]
    viewOptions = viewOptions
    dispatch('update', { key: 'groupBy', value: viewOptions.groupBy })
  }

  function pickOrdering (pickedKey: string): void {
    const configuredOrder = config.orderBy.find(([key]) => key === pickedKey)
    if (configuredOrder === undefined || pickedKey === orderKey) return
    viewOptions.orderBy = [configuredOrder[0], configuredOrder[1]]
    viewOptions = viewOptions
    dispatch('update', { key: 'orderBy', value: viewOptions.orderBy })
  }

  function flipDirection (): void {
    if (orderKey === undefined) return
    viewOptions.orderBy = [orderKey, isDescending ? SortingOrder.Ascending : SortingOrder.Descending]
    viewOptions = viewOptions
    dispatch('update', { key: 'orderBy', value: viewOptions.orderBy })
  }

  function currentToggleValue (option: ViewOptionModel, currentOptions: ViewOptions): boolean {
    return Boolean(currentOptions[option.key] ?? option.defaultValue)
  }

  function isToggleChecked (option: ViewOptionModel, currentOptions: ViewOptions): boolean {
    const storedValue = currentToggleValue(option, currentOptions)
    return invertedToggleLabels.has(option.key) ? !storedValue : storedValue
  }

  function toggleLabel (option: ViewOptionModel, workflowMode: boolean): IntlString {
    const label = invertedToggleLabels.get(option.key) ?? option.label
    return workflowMode ? workflowColumnLabel(label) : label
  }

  function flipToggle (option: ViewOptionModel): void {
    const nextValue = !currentToggleValue(option, viewOptions)
    viewOptions[option.key] = nextValue
    viewOptions = viewOptions
    dispatch('update', { key: option.key, value: nextValue })
  }

  function visibleDropdownValues (option: ViewOptionModel, currentOptions: ViewOptions): DropdownIntlItem[] {
    if (!isDropdownType(option)) return []
    return option.values.filter((entry) => entry.hidden?.(currentOptions) !== true)
  }

  function pickDropdownValue (option: ViewOptionModel, pickedId: string): void {
    viewOptions[option.key] = pickedId
    viewOptions = viewOptions
    dispatch('update', { key: option.key, value: pickedId })
  }

  const rowClass = 'flex h-8 items-center justify-between gap-3 text-sm'
</script>

<div class={embedded ? 'flex flex-col gap-0.5' : `${menuPopupClass} w-72 gap-0.5 p-2`}>
  {#if isGroupingShown}
    {#each groupLevels as levelKey, levelPosition}
      <div class="grouping {rowClass}">
        <span class="min-w-0 shrink truncate text-muted-foreground">
          <Label label={levelPosition === 0 ? view.string.Grouping : view.string.Then} />
        </span>
        <DropdownLabelsIntl
          kind={'ghost'}
          size={'small'}
          width={'11.5rem'}
          justify={'left'}
          label={levelPosition === 0 ? view.string.Grouping : view.string.Then}
          items={choicesForLevel(levelPosition, viewOptions.groupBy)}
          selected={levelKey}
          on:selected={(event) => {
            pickGrouping(levelPosition, event.detail)
          }}
        />
      </div>
    {/each}
  {/if}
  {#if isOrderingShown}
    <div class="ordering {rowClass}">
      <span class="min-w-0 shrink truncate text-muted-foreground"><Label label={view.string.Ordering} /></span>
      <div class="flex shrink-0 items-center gap-1">
        <DropdownLabelsIntl
          kind={'ghost'}
          size={'small'}
          width={isDirectionShown ? '9.5rem' : '11.5rem'}
          justify={'left'}
          label={view.string.Ordering}
          items={orderingChoices}
          selected={orderKey}
          on:selected={(event) => {
            pickOrdering(event.detail)
          }}
        />
        {#if isDirectionShown}
          <button
            type="button"
            class={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'text-muted-foreground')}
            aria-label={$directionLabel}
            use:tooltip={{ label: isDescending ? descendingLabel : ascendingLabel, direction: 'bottom' }}
            on:click={flipDirection}
          >
            {#if isDescending}
              <ArrowDownWideNarrow size={14} />
            {:else}
              <ArrowUpNarrowWide size={14} />
            {/if}
          </button>
        {/if}
      </div>
    </div>
  {/if}
  {#if isDividerShown}
    <div class="my-1.5 h-px bg-border"></div>
  {/if}
  {#each shownOptions as option (option.key)}
    {#if isToggleType(option)}
      <label class="viewoption-other {rowClass} cursor-pointer">
        <span class="min-w-0 shrink truncate text-muted-foreground"><Label label={toggleLabel(option, isWorkflowMode)} /></span>
        <span class="flex shrink-0 items-center pr-1">
          <Switch
            size="sm"
            checked={isToggleChecked(option, viewOptions)}
            onCheckedChange={() => {
              flipToggle(option)
            }}
          />
        </span>
      </label>
    {:else if isDropdownType(option)}
      <div class="viewoption-other {rowClass}">
        <span class="min-w-0 shrink truncate text-muted-foreground"><Label label={option.label} /></span>
        <DropdownLabelsIntl
          kind={'ghost'}
          size={'small'}
          width={'11.5rem'}
          justify={'left'}
          label={option.label}
          items={visibleDropdownValues(option, viewOptions)}
          selected={viewOptions[option.key] ?? option.defaultValue}
          on:selected={(event) => {
            pickDropdownValue(option, event.detail)
          }}
        />
      </div>
    {:else}
      <div class="viewoption-other {rowClass}">
        <span class="min-w-0 shrink truncate text-muted-foreground"><Label label={option.label} /></span>
      </div>
    {/if}
  {/each}
  <slot name="extra" />
</div>
