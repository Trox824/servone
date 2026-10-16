<!--
  platform.status.LoadingPlugin (every lazy chunk) renders nothing: the pending slot already shows
  its own delayed Loading, and as text it flashed "Loading plugin …" on each first app visit.
-->
<script lang="ts">
  import platform, { Severity, type Status } from '@hcengineering/platform'
  import { Info } from '@lucide/svelte'
  import { Label } from '../original'

  export let status: Status
  export let overflow: boolean = true

  $: loading = status.severity === Severity.INFO && status.code === platform.status.LoadingPlugin
</script>

<div
  class="flex items-center justify-center text-sm select-none"
  class:text-amber-600={status.severity === Severity.WARNING}
  class:text-destructive={status.severity === Severity.ERROR}
  class:overflow-label={overflow}
>
  {#if !loading && status.severity !== Severity.OK}
    <Info size={14} class="shrink-0" />
    <span class="ml-2" class:overflow-label={overflow}>
      <Label label={status.code} params={status.params} />
    </span>
  {/if}
</div>
