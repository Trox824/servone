<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import type { AnySvelteComponent, LabelAndProps } from '../original'
  import type { ComponentType } from 'svelte'
  import { Icon, Label, tooltip as tooltipAction } from '../original'
  import { cn } from '../lib/utils'

  export let id: string | number
  export let icon: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let color: string | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let title: string | undefined = undefined
  export let kind: 'nuance' | 'subtle' = 'nuance'
  export let name: string
  export let checked: boolean = false
  export let tooltip: LabelAndProps | undefined = undefined
  export let disabled: boolean = false

  $: isIconOnly = title === undefined && label === undefined
  let resolvedAriaLabel: string | undefined

  $: if (!isIconOnly) {
    resolvedAriaLabel = undefined
  } else if (label !== undefined) {
    translateCB(label, labelParams, $themeStore.language, (text: string) => {
      resolvedAriaLabel = text
    })
  } else if (tooltip?.label !== undefined) {
    translateCB(tooltip.label, {}, $themeStore.language, (text: string) => {
      resolvedAriaLabel = text
    })
  } else {
    resolvedAriaLabel = title
  }

  $: segmentClass = cn(
    'relative inline-flex h-full min-w-0 shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent text-sm font-medium transition-all hover:text-foreground has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
    isIconOnly ? 'aspect-square px-0' : 'px-2',
    checked && 'bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30',
    disabled && 'pointer-events-none opacity-50'
  )
</script>

<label
  class={segmentClass}
  data-id={`tab-${id}`}
  data-view={tooltip?.label}
  data-state={checked ? 'active' : 'inactive'}
  use:tooltipAction={tooltip}
>
  <input
    type="radio"
    class="sr-only"
    {name}
    {checked}
    {disabled}
    aria-label={resolvedAriaLabel}
    on:change
  />
  {#if icon}
    <span class="pointer-events-none inline-flex shrink-0">
      <Icon {icon} size={'small'} fill={color} />
    </span>
  {/if}
  {#if label}
    <span><Label {label} params={labelParams} /></span>
  {/if}
  {#if title}
    <span>{title}</span>
  {/if}
</label>
