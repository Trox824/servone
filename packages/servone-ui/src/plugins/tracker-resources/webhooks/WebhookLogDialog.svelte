<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import { RefreshCw } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { Button } from '../../../lib/components/ui/button'
  import * as Dialog from '../../../lib/components/ui/dialog'
  import { str } from '../sprints/plugin'
  import { ServiceApiError } from '../../chunter-resources/webhooks/api'
  import { readHookLog, urlLabel, type AttemptRecord, type TrackerHook } from './api'

  export let hook: TrackerHook
  export let onClose: () => void

  const MAX_ATTEMPTS = 6

  let attempts: AttemptRecord[] | undefined
  let failure: string | undefined
  let isLoading = false

  async function load (): Promise<void> {
    isLoading = true
    failure = undefined
    try {
      attempts = await readHookLog(hook.id)
    } catch (error) {
      if (!(error instanceof ServiceApiError)) throw error
      failure = error.code
    } finally {
      isLoading = false
    }
  }

  onMount(() => {
    void load()
  })

  const isOk = (attempt: AttemptRecord): boolean =>
    attempt.error === undefined && attempt.status >= 200 && attempt.status < 300
</script>

<Dialog.Root
  open
  onOpenChange={(isOpen) => {
    if (!isOpen) onClose()
  }}
>
  <Dialog.Content class="gap-3 sm:max-w-4xl" data-id="tracker-webhook-log">
    <Dialog.Header>
      <Dialog.Title><Label label={str.DeliveryLog} /></Dialog.Title>
      <Dialog.Description>
        <span class="font-mono">{urlLabel(hook.url)}</span> · <Label label={str.DeliveryLogHint} />
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex justify-end">
      <Button variant="outline" size="sm" disabled={isLoading} onclick={() => { void load() }}>
        <RefreshCw class={isLoading ? 'animate-spin' : ''} />
        <Label label={str.RefreshLog} />
      </Button>
    </div>
    <div class="max-h-[60vh] overflow-auto rounded-md border">
      {#if failure !== undefined}
        <p class="m-0 p-4 text-sm text-destructive"><Label label={str.WebhooksFailed} /> ({failure})</p>
      {:else if attempts !== undefined && attempts.length === 0}
        <p class="m-0 p-4 text-sm text-muted-foreground"><Label label={str.NoLogEntries} /></p>
      {:else if attempts !== undefined}
        <table class="w-full border-collapse text-xs">
          <thead class="sticky top-0 bg-popover text-left text-muted-foreground">
            <tr>
              <th class="px-3 py-2 font-medium"><Label label={str.LogTime} /></th>
              <th class="px-3 py-2 font-medium"><Label label={str.LogEvent} /></th>
              <th class="px-3 py-2 font-medium"><Label label={str.LogAttempt} /></th>
              <th class="px-3 py-2 font-medium"><Label label={str.LogStatus} /></th>
              <th class="px-3 py-2 text-right font-medium"><Label label={str.LogDuration} /></th>
              <th class="px-3 py-2 font-medium"><Label label={str.LogResponse} /></th>
            </tr>
          </thead>
          <tbody>
            {#each attempts as attempt, index (`${attempt.deliveryId}-${attempt.attempt}-${index}`)}
              <tr class="border-t align-top">
                <td class="px-3 py-2 whitespace-nowrap tabular-nums">{new Date(attempt.at).toLocaleString()}</td>
                <td class="px-3 py-2 font-mono whitespace-nowrap">{attempt.event}</td>
                <td class="px-3 py-2 tabular-nums">{attempt.event === 'test' ? '1' : `${attempt.attempt}/${MAX_ATTEMPTS}`}</td>
                <td class="px-3 py-2 font-medium whitespace-nowrap tabular-nums" class:text-destructive={!isOk(attempt)}>
                  {attempt.error ?? attempt.status}
                </td>
                <td class="px-3 py-2 text-right tabular-nums">{attempt.durationMs} ms</td>
                <td class="max-w-72 px-3 py-2 font-mono break-all text-muted-foreground">{attempt.responseStart}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
