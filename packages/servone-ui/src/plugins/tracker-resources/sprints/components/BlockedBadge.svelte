<script lang="ts">
  import { Label, tooltip } from '@hcengineering/ui'
  import { blockedStore, blockersOf } from '../blocked'
  import { str } from '../plugin'

  export let issueId: string
  export let label = false
  export let blocking = true

  $: waits = blockersOf($blockedStore, issueId)
  $: holds = ($blockedStore.blocking.get(issueId) ?? []).map((id) => $blockedStore.issues.get(id))
  const describe = (list: Array<{ identifier: string, title: string } | undefined>): string =>
    list
      .filter((b) => b !== undefined)
      .map((b) => `${b.identifier} ${b.title}`.trim())
      .join(', ')
</script>

{#if waits.length > 0}
  <span
    class="inline-flex shrink-0 items-center gap-1 rounded px-1 text-xs font-medium text-red-500 {label ? 'bg-red-500/10 py-px' : ''}"
    data-blocked
    use:tooltip={{ label: str.BlockedByList, props: { list: describe(waits) } }}
  >
    <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M3.8 12.2 12.2 3.8" stroke-linecap="round" />
    </svg>
    {#if label}<Label label={str.Blocked} />{/if}
  </span>
{/if}
{#if blocking && holds.length > 0}
  <span
    class="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-amber-500"
    use:tooltip={{ label: str.BlockingList, props: { list: describe(holds) } }}
  >
    <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <path d="M8 2.5 14 13H2Z" stroke-linejoin="round" />
      <path d="M8 6.5v3M8 11.2v.1" stroke-linecap="round" />
    </svg>
    <span class="tabular-nums">{holds.length}</span>
  </span>
{/if}
