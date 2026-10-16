<!--
  Dispatches `change` with the boolean, not the native Event.
  Uses the CLI switch's `size` prop, not width overrides: its data-[size=default]:w-[32px] out-specifies plain w-* utilities.
-->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import { Label as HulyLabel } from '../original'
  import { Switch } from '../lib/components/ui/switch'
  import { Label } from '../lib/components/ui/label'
  import { cn } from '../lib/utils'

  export let title: string | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let size: 'small' | 'large' = 'large'
  export let checked: boolean = false
  export let disabled: boolean = false
  export let background: boolean = false

  const dispatch = createEventDispatcher()

  function handleCheckedChange (v: boolean): void {
    checked = v
    dispatch('change', v)
  }

  const switchSize: Record<'small' | 'large', 'sm' | 'default'> = {
    small: 'sm',
    large: 'default'
  }
</script>

<Label
  class={cn(
    'items-center gap-2',
    disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer',
    background && 'rounded-3xl bg-muted p-1'
  )}
>
  <Switch {checked} {disabled} size={switchSize[size]} onCheckedChange={handleCheckedChange} />
  {#if label || title}
    <span class="select-none text-sm text-foreground">
      {#if label}<HulyLabel {label} params={labelParams} />{/if}
      {#if title}{title}{/if}
    </span>
  {/if}
</Label>

<style>
  /* Dark mode: stock neutral --primary is a flat light gray that reads ambiguous on a switch, so use
       --sidebar-primary. Attribute selectors out-specify the CLI's :where()-wrapped utility regardless
       of source order; the CLI file stays unedited. */
  :global(.theme-dark:not(.white) [data-slot='switch'][data-state='checked']) {
    background-color: var(--sidebar-primary);
  }
  :global(.theme-dark:not(.white) [data-slot='switch'][data-state='checked'] [data-slot='switch-thumb']) {
    background-color: var(--sidebar-primary-foreground);
  }
</style>
