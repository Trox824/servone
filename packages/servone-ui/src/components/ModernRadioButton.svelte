<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { generateId } from '@hcengineering/core'
  import { Label } from '../original'
  import { cn } from '../lib/utils'

  export let id: string = generateId()
  export let group: any
  export let value: any
  export let label: string | undefined = undefined
  export let labelIntl: IntlString | undefined = undefined
  export let labelParams: Record<string, any> | undefined = undefined
  export let checked: boolean = false
  export let disabled: boolean = false
  export let error: boolean = false

  $: hasLabelText = label !== undefined || labelIntl !== undefined || $$slots.default === true
</script>

<label class={cn('inline-flex items-center gap-1.5', disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer')}>
  <input
    type="radio"
    {id}
    {value}
    {checked}
    {disabled}
    bind:group
    on:change
    class={cn(
      'size-4 shrink-0 appearance-none rounded-full border bg-background bg-clip-padding p-[3px] transition-colors',
      'checked:border-primary checked:bg-primary checked:[background-clip:content-box] checked:[background-color:currentColor]',
      error ? 'border-destructive' : 'border-input'
    )}
  />
  {#if hasLabelText}
    <span class="select-none text-sm text-foreground">
      {#if labelIntl !== undefined}
        <Label label={labelIntl} params={labelParams} />
      {:else if label !== undefined}
        {label}
      {/if}
      <slot />
    </span>
  {/if}
  <slot name="after" />
</label>
