<script lang="ts">
  import { generateId } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { Label } from '../original'
  import { cn } from '../lib/utils'

  export let id = generateId()
  export let group: unknown
  export let value: unknown
  export let disabled: boolean = false
  export let labelOverflow: boolean = false
  export let label: string | undefined = undefined
  export let labelSize: 'medium' | 'large' = 'medium'
  export let labelIntl: IntlString | undefined = undefined
  export let labelParams: Record<string, unknown> | undefined = undefined
  export let action: (() => void) | (() => Promise<void>) = () => {}
  export let gap: 'large' | 'small' | 'medium' | 'none' = 'none'
  export let labelGap: 'large' | 'medium' = 'medium'
  export let kind: 'primary' | 'positive' | 'negative' | 'default' = 'default'

  const bottomMarginByGap = { none: 'mb-0', small: 'mb-1.5', medium: 'mb-2.5', large: 'mb-4' }
  const colorByKind = {
    default: 'text-primary',
    primary: 'text-primary',
    positive: 'text-emerald-600',
    negative: 'text-destructive'
  }

  function runActionIfChanging (): void {
    if (!disabled && group !== value) void action()
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  tabindex="-1"
  class={cn(
    'flex cursor-pointer items-center',
    bottomMarginByGap[gap],
    disabled && 'pointer-events-none opacity-50'
  )}
  on:click={runActionIfChanging}
>
  <input
    type="radio"
    {id}
    {value}
    {disabled}
    bind:group
    class={cn(
      'size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-input bg-background p-[3px] transition-colors',
      'not-checked:hover:border-muted-foreground',
      'checked:border-current checked:[background-clip:content-box,padding-box] checked:[background-image:linear-gradient(currentColor,currentColor)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      colorByKind[kind]
    )}
    on:click={runActionIfChanging}
  />
  <label
    for={id}
    class={cn(
      'cursor-pointer text-foreground',
      labelGap === 'large' ? 'ml-2.5' : 'ml-1.5',
      labelSize === 'large' ? 'text-base' : 'text-sm',
      labelOverflow && 'truncate'
    )}
  >
    {#if $$slots.default}
      <slot />
    {:else if labelIntl}
      <Label label={labelIntl} params={labelParams} />
    {:else}
      {label ?? ''}
    {/if}
  </label>
</div>
