<!--
  Pushed into Root.svelte's status bar by ./install.ts; search.css centres its wrapper
  (#servone-master-search).
-->
<script lang="ts">
  import { Search } from '@lucide/svelte'
  import type { IntlString } from '@hcengineering/platform'
  import ui, { Label, location } from '../original'
  import { openSearch } from './open-search'

  const searchIn = 'ui:string:ServoneSearchIn' as IntlString

  let workspaceName: string = ''
  $: workspaceName = $location.path[1] ?? ''
</script>

<!-- Huly's global `button { outline: none }` strips the native ring, so one is added here.
     text-foreground/65, not text-muted-foreground: the latter is 4.42:1 on the pill, under WCAG AA. -->
<button
  type="button"
  class="flex h-7 w-[min(40vw,32rem)] items-center gap-2 rounded-md border border-foreground/15 bg-background/60 px-2.5 text-[13px] text-foreground/65 transition-colors hover:border-foreground/25 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  on:click={openSearch}
>
  <Search size={14} class="shrink-0" />
  <span class="flex-1 truncate text-left">
    {#if workspaceName !== ''}
      <Label label={searchIn} params={{ workspace: workspaceName }} />
    {:else}
      <Label label={ui.string.Search} />
    {/if}
  </span>
  <kbd class="rounded border px-1 text-[11px] text-foreground/65 max-[480px]:hidden">⌘K</kbd>
</button>
