<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Label as ToggleLabel } from '../original'
  import { createEventDispatcher } from 'svelte'
  import { Switch } from '../lib/components/ui/switch'

  export let label: IntlString | undefined = undefined
  export let on: boolean = false
  export let disabled: boolean = false

  const dispatch = createEventDispatcher<{ change: boolean }>()

  function applyState (nextState: boolean): void {
    on = nextState
    dispatch('change', nextState)
  }

  function onLabelClick (): void {
    if (disabled) return
    applyState(!on)
  }
</script>

<div class="flex items-center gap-1.5">
  <Switch size="sm" checked={on} {disabled} onCheckedChange={applyState} />
  {#if label}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="cursor-pointer text-xs text-muted-foreground" on:click={onLabelClick}>
      <ToggleLabel {label} />
    </span>
  {/if}
</div>

<style global>
  :global(.theme-dark:not(.white) [data-slot='switch'][data-state='checked']) {
    background-color: var(--sidebar-primary);
  }
  :global(.theme-dark:not(.white) [data-slot='switch'][data-state='checked'] [data-slot='switch-thumb']) {
    background-color: var(--sidebar-primary-foreground);
  }
</style>
