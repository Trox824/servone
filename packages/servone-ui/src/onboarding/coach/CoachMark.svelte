<script lang="ts">
  import { type IntlString } from '@hcengineering/platform'
  import { onDestroy, onMount } from 'svelte'
  import * as Popover from '../../lib/components/ui/popover'
  import { Label } from '../../original'

  export let anchor: HTMLElement
  export let message: IntlString
  export let side: 'top' | 'right' | 'bottom' | 'left'
  export let align: 'start' | 'center' | 'end'
  export let onDismiss: () => void

  const gotItLabel = 'ui:string:ServoneCoachGotIt' as IntlString

  function onKeydown (event: KeyboardEvent): void {
    if (event.key === 'Escape') onDismiss()
  }

  onMount(() => {
    anchor.classList.add('servone-coach-target')
    anchor.scrollIntoView({ block: 'nearest' })
  })
  onDestroy(() => {
    anchor.classList.remove('servone-coach-target')
  })
</script>

<svelte:window on:keydown|capture={onKeydown} />

<Popover.Root open={true} onOpenChange={(isOpen) => { if (!isOpen) onDismiss() }}>
  <Popover.Content
    customAnchor={anchor}
    {side}
    {align}
    sideOffset={10}
    trapFocus={false}
    onOpenAutoFocus={(event) => { event.preventDefault() }}
    onCloseAutoFocus={(event) => { event.preventDefault() }}
    class="servone-float-panel servone-coach"
    role="status"
  >
    <p class="servone-coach-text"><Label label={message} /></p>
    <div class="servone-coach-footer">
      <button type="button" class="servone-coach-done" on:click={onDismiss}><Label label={gotItLabel} /></button>
    </div>
  </Popover.Content>
</Popover.Root>

<style>
  :global(.servone-coach) {
    gap: 0;
    width: min(17rem, calc(100vw - 2rem));
    padding: 0.75rem;
    border-radius: 0.75rem;
  }
  :global(.servone-coach-text) {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    text-wrap: pretty;
  }
  :global(.servone-coach-footer) {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.625rem;
  }
  :global(.servone-coach-done) {
    height: 1.875rem;
    padding: 0 0.75rem;
    border: none;
    border-radius: 6px;
    background: var(--primary);
    color: var(--primary-foreground);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 120ms ease-out, transform 80ms ease-out;
  }
  :global(.servone-coach-done:hover) {
    background: color-mix(in oklch, var(--primary) 88%, white);
  }
  :global(.servone-coach-done:active) {
    transform: translateY(1px);
  }
  :global(.servone-coach-done:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
</style>
