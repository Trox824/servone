<script lang="ts">
  import type { RadioItem } from '../original'
  import RadioButton from './RadioButton.svelte'

  export let items: RadioItem[]
  export let selected: unknown = undefined
  export let disabled: boolean = false
  export let gap: 'large' | 'small' | 'medium' | 'none' = 'small'
</script>

{#if items?.length > 0}
  <div class="flex flex-col">
    {#each items as option, position}
      <RadioButton
        id={option.id}
        label={option.label}
        labelGap={option.labelGap}
        labelIntl={option.labelIntl}
        labelParams={option.labelParams}
        value={option.value}
        action={option.action}
        disabled={disabled || option.disabled}
        gap={position === items.length - 1 ? 'none' : gap}
        bind:group={selected}
      />
    {/each}
  </div>
{/if}
