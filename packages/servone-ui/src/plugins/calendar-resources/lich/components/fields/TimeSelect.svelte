<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import * as Select from '../../../../../lib/components/ui/select'
  import { hm } from './time-slots'

  interface TimeOption {
    minutes: number
    hint?: string
    isDisabled?: boolean
  }

  export let id: string
  export let value: number
  export let options: TimeOption[]
  export let disabled = false
  export let ariaLabel: string

  const dispatch = createEventDispatcher<{ change: number }>()
</script>

<Select.Root
  type="single"
  value={String(value)}
  onValueChange={(picked) => { dispatch('change', Number(picked)) }}
  {disabled}
>
  <Select.Trigger {id} aria-label={ariaLabel} class="w-full min-w-24 tabular-nums">
    {hm(value)}
  </Select.Trigger>
  <Select.Content class="max-h-72">
    {#each options as option (option.minutes)}
      <Select.Item value={String(option.minutes)} label={hm(option.minutes)} disabled={option.isDisabled}>
        <span class="tabular-nums">{hm(option.minutes)}</span>
        {#if option.hint !== undefined}<span class="text-muted-foreground">{option.hint}</span>{/if}
      </Select.Item>
    {/each}
  </Select.Content>
</Select.Root>
