<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { ButtonItem } from '../original'
  import Button from './Button.svelte'

  export let items: ButtonItem[]
  export let selected: string | boolean = false
  export let allowDeselected: boolean = true
  export let mode: 'filled-icon' | 'highlighted' | 'selected' = 'selected'
  export let props: any = {}

  const dispatch = createEventDispatcher<{ select: string | false }>()

  function toggleChoice (itemId: string): void {
    if (selected !== itemId) {
      selected = itemId
      dispatch('select', itemId)
      return
    }
    if (!allowDeselected) return
    selected = false
    dispatch('select', false)
  }
</script>

{#each items as item}
  {@const isChosen = selected === item.id}
  <Button
    {...item}
    id={`btnGID-${item.id}`}
    iconProps={mode === 'filled-icon' && isChosen ? { filled: true } : {}}
    selected={mode === 'selected' && isChosen}
    highlight={mode === 'highlighted' && isChosen}
    {...props}
    on:click={() => { toggleChoice(item.id) }}
  />
{/each}
