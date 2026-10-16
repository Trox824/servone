<!-- Search, filter and narrowing-mode misses already get IssuesView's own cards, so this covers only the untouched view. -->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Button, Label } from '@hcengineering/ui'
  import { filterStore, rawSearchTextStore, resultIssueCountStore, showEmptyGroupsStore } from '@hcengineering/view-resources'

  export let label: IntlString
  export let isNarrowed: boolean
  export let actionLabel: IntlString | undefined = undefined
  export let onAction: (() => void) | undefined = undefined

  $: isEmpty = $resultIssueCountStore === 0 && $rawSearchTextStore.trim() === '' && $filterStore.length === 0 && !isNarrowed && !$showEmptyGroupsStore
</script>

{#if isEmpty}
  <!-- Out of flow like IssuesView's cards: collapsing the viewlet starves its virtual scroller. -->
  <div class="workflow-empty-state pointer-events-none absolute inset-0 z-[101] flex flex-col items-center justify-center gap-3">
    <p class="m-0 text-sm text-muted-foreground"><Label {label} /></p>
    {#if actionLabel !== undefined && onAction !== undefined}
      <div class="pointer-events-auto">
        <Button kind={'primary'} label={actionLabel} on:click={onAction} />
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Same containing-block fix as IssuesView's overlay: centre on the panel, not panel plus navigator. */
  :global(.hulyComponent:has(.workflow-empty-state)) {
    position: relative;
  }
</style>
