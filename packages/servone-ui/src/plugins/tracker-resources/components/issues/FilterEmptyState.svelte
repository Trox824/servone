<script lang="ts">
  import { translate, type IntlString } from '@hcengineering/platform'
  import { Button, Label, themeStore } from '@hcengineering/ui'
  import { setFilters } from '@hcengineering/view-resources'
  import { str } from '../../sprints/plugin'

  export let modeLabel: IntlString | undefined
  export let hasFilters: boolean
  export let onShowAll: (() => void) | undefined

  let mode = ''
  $: if (modeLabel !== undefined) void translate(modeLabel, {}, $themeStore.language).then((v) => (mode = v))
</script>

<div class="search-empty-state flex max-w-md flex-col items-center gap-2 rounded-lg border border-border bg-popover p-6 text-center shadow-md" role="region" aria-live="polite">
  <h2 class="m-0 text-base font-medium text-foreground"><Label label={str.NoMatchingIssues} /></h2>
  {#if modeLabel !== undefined}
    <p class="m-0 text-sm text-muted-foreground"><Label label={str.ModeNarrows} params={{ mode }} /></p>
  {/if}
  <div class="mt-2 flex gap-2">
    {#if modeLabel !== undefined && onShowAll !== undefined}
      <Button kind={'primary'} label={str.ShowAllIssues} on:click={onShowAll} />
    {/if}
    {#if hasFilters}
      <Button kind={'regular'} label={str.ClearFilters} on:click={() => setFilters([])} />
    {/if}
  </div>
</div>
