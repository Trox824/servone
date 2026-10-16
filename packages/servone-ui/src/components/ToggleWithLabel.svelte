<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import { Label } from '../original'
  import Toggle from './Toggle.svelte'

  export let label: IntlString
  export let description: IntlString | undefined = undefined
  export let on: boolean = false
  export let disabled: boolean = false

  const dispatch = createEventDispatcher<{ change: boolean }>()
</script>

<div class="flex w-full items-center justify-between">
  <div class="mr-4 select-none text-foreground">
    <Label {label} />
    {#if description}
      <div class="block text-xs text-muted-foreground">
        <Label label={description} />
      </div>
    {/if}
  </div>
  <Toggle bind:on {disabled} on:change={() => dispatch('change', on)} />
</div>
