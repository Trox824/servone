<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { LabelAndProps, TabItem } from '../original'
  import SwitcherBase from './SwitcherBase.svelte'

  export let items: TabItem[]
  export let selected: string | number = ''
  export let kind: 'nuance' | 'subtle' = 'nuance'
  export let name: string
  export let onlyIcons: boolean = false
  export let disabled: boolean = false
  export let tooltip: LabelAndProps | undefined = undefined

  const dispatch = createEventDispatcher<{ select: TabItem }>()

  function resolveTooltip (tab: TabItem, isGroupDisabled: boolean, groupTooltip: LabelAndProps | undefined): LabelAndProps | undefined {
    if (isGroupDisabled && groupTooltip !== undefined) return groupTooltip
    return tab.tooltip !== undefined ? { label: tab.tooltip } : undefined
  }

  function choose (tab: TabItem): void {
    if (disabled) return
    dispatch('select', tab)
    tab.action?.()
  }
</script>

<div
  role="radiogroup"
  class="inline-flex h-8 shrink-0 flex-nowrap items-center gap-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground"
>
  {#each items as tab (tab.id)}
    <SwitcherBase
      id={tab.id}
      {name}
      {kind}
      {disabled}
      checked={selected === tab.id}
      icon={tab.icon}
      color={tab.color}
      title={onlyIcons ? undefined : tab.label}
      label={onlyIcons ? undefined : tab.labelIntl}
      labelParams={onlyIcons ? undefined : tab.labelParams}
      tooltip={resolveTooltip(tab, disabled, tooltip)}
      on:change={() => {
        choose(tab)
      }}
    />
  {/each}
</div>
