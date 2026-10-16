<script lang="ts">
  import type { Issue } from '@hcengineering/tracker'

  export let epic: Issue | undefined
</script>

{#if epic !== undefined}
  <span
    class="inline-flex max-w-40 shrink-0 items-center truncate rounded-sm bg-violet-500/12 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300"
    title={epic.title}
  >
    {epic.title}
  </span>
{/if}
