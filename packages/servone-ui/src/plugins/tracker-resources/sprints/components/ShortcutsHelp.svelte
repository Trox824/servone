<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { IconClose, Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { str } from '../plugin'

  export let items: Array<[string[], IntlString]>

  const dispatch = createEventDispatcher()
</script>

<div class="flex w-80 flex-col gap-3 rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg">
  <div class="flex items-center justify-between">
    <h2 class="font-semibold"><Label label={str.KeyboardShortcuts} /></h2>
    <button type="button" class="flex text-muted-foreground hover:text-foreground" on:click={() => dispatch('close')}><IconClose size={'small'} /></button>
  </div>
  <dl class="flex flex-col gap-1.5">
    {#each items as [keys, label]}
      <div class="flex items-center justify-between gap-3">
        <dt class="text-muted-foreground"><Label {label} /></dt>
        <dd class="flex gap-1">
          {#each keys as k}
            <kbd class="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-[11px]">{k}</kbd>
          {/each}
        </dd>
      </div>
    {/each}
  </dl>
</div>
