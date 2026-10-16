<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Label, Loading, TimeSince } from '@hcengineering/ui'
  import { readWebhookLog, ServiceApiError, type WebhookCall } from './api'

  export let hookId: string

  const RECENT_CALLS = 'chunter:string:ServoneRecentCalls' as IntlString
  const NO_CALLS = 'chunter:string:ServoneNoCallsYet' as IntlString
  const RATE_LIMITED_CALLS = 'chunter:string:ServoneRateLimitedCalls' as IntlString

  let calls: WebhookCall[] | undefined
  let failure: string | undefined

  async function load (id: string): Promise<void> {
    calls = undefined
    failure = undefined
    try {
      calls = await readWebhookLog(id)
    } catch (error) {
      if (!(error instanceof ServiceApiError)) throw error
      failure = error.code
    }
  }

  $: void load(hookId)
</script>

<div class="flex-col gap-1 webhook-log">
  <span class="text-sm font-medium"><Label label={RECENT_CALLS} /></span>
  {#if failure !== undefined}
    <span class="text-sm error-color">{failure}</span>
  {:else if calls === undefined}
    <Loading size="small" />
  {:else if calls.length === 0}
    <span class="text-sm content-dark-color"><Label label={NO_CALLS} /></span>
  {:else}
    {#each calls as call}
      <div class="flex-row-center gap-2 text-sm">
        <span class="status" class:failed={call.status >= 400}>{call.status}</span>
        {#if call.count !== undefined}
          <span class="content-dark-color"><Label label={RATE_LIMITED_CALLS} params={{ count: call.count }} /></span>
        {/if}
        <span class="content-dark-color"><TimeSince value={call.at} /></span>
      </div>
    {/each}
  {/if}
</div>

<style lang="scss">
  .webhook-log {
    max-height: 12rem;
    overflow-y: auto;
  }
  .status {
    min-width: 2rem;
    font-variant-numeric: tabular-nums;
    color: var(--theme-won-color);

    &.failed {
      color: var(--theme-lost-color);
    }
  }
</style>
