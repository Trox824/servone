<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { generateId } from '@hcengineering/core'
  import { createEventDispatcher } from 'svelte'
  import { Label as TranslatedLabel } from '../original'
  import { Checkbox } from '../lib/components/ui/checkbox'
  import { Label as FieldLabel } from '../lib/components/ui/label'
  import { cn } from '../lib/utils'

  export let id: string = generateId()
  export let label: string | undefined = undefined
  export let labelIntl: IntlString | undefined = undefined
  export let labelParams: Record<string, any> | undefined = undefined
  export let checked: boolean = false
  export let indeterminate: boolean = false
  export let disabled: boolean = false
  export let error: boolean = false
  export let required: boolean = false

  const dispatch = createEventDispatcher<{ change: boolean }>()

  function handleCheckedChange (nextChecked: boolean): void {
    checked = nextChecked
    dispatch('change', nextChecked)
  }

  $: hasLabelText = label !== undefined || labelIntl !== undefined || $$slots.default === true
</script>

<FieldLabel class={cn('items-center gap-1.5', disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer')}>
  <Checkbox
    {id}
    {checked}
    {indeterminate}
    {disabled}
    {required}
    aria-invalid={error}
    class={cn(error && 'border-destructive')}
    onCheckedChange={handleCheckedChange}
  />
  {#if hasLabelText}
    <span class="select-none">
      {#if labelIntl !== undefined}
        <TranslatedLabel label={labelIntl} params={labelParams} />
      {:else if label !== undefined}
        {label}
      {/if}
      <slot />
      {#if required}
        <span class="text-destructive">&nbsp;*</span>
      {/if}
    </span>
  {/if}
  <slot name="after" />
</FieldLabel>
