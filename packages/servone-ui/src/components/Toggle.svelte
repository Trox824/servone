<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { tooltip, type LabelAndProps } from '../original'
  import { Switch } from '../lib/components/ui/switch'

  export let id: string | undefined = undefined
  export let on: boolean = false
  export let disabled: boolean = false
  export let showTooltip: LabelAndProps | undefined = undefined

  const dispatch = createEventDispatcher<{ change: boolean }>()

  function handleCheckedChange (nextState: boolean): void {
    on = nextState
    dispatch('change', nextState)
  }
</script>

<span class="inline-flex align-middle" use:tooltip={showTooltip} {...$$restProps}>
  <Switch {id} checked={on} {disabled} onCheckedChange={handleCheckedChange} />
</span>

<style>
  :global(.theme-dark:not(.white) [data-slot='switch'][data-state='checked']) {
    background-color: var(--sidebar-primary);
  }
  :global(.theme-dark:not(.white) [data-slot='switch'][data-state='checked'] [data-slot='switch-thumb']) {
    background-color: var(--sidebar-primary-foreground);
  }
</style>
