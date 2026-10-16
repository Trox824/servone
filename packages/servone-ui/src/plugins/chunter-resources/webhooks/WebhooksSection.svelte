<script lang="ts">
  import { onMount } from 'svelte'
  import type { Channel } from '@hcengineering/chunter'
  import { employeeRefByAccountUuidStore, PersonRefPresenter } from '@hcengineering/contact-resources'
  import type { IntlString } from '@hcengineering/platform'
  import presentation, { MessageBox } from '@hcengineering/presentation'
  import { Plus } from '@lucide/svelte'
  import { Button as ShadButton } from '../../../lib/components/ui/button'
  import { Switch } from '../../../lib/components/ui/switch'
  import { Label, Loading, showPopup, TimeSince } from '@hcengineering/ui'
  import {
    listWebhooks,
    revokeWebhook,
    setAllowMentions,
    ServiceApiError,
    webhooksServiceUrl,
    type WebhookSummary
  } from './api'
  import CreateWebhookPopup from './CreateWebhookPopup.svelte'
  import WebhookLog from './WebhookLog.svelte'
  import { intl } from '../../../lib/intl'

  export let channel: Channel

  const TITLE = 'chunter:string:ServoneIncomingWebhooks' as IntlString
  const NO_HOOKS = 'chunter:string:ServoneNoIncomingWebhooks' as IntlString
  const HINT = 'chunter:string:ServoneIncomingWebhooksHint' as IntlString
  const REVOKE = 'chunter:string:ServoneRevoke' as IntlString
  const REVOKE_CONFIRM = 'chunter:string:ServoneRevokeWebhookConfirm' as IntlString
  const REVOKED = 'chunter:string:ServoneRevoked' as IntlString
  const NO_CALLS = 'chunter:string:ServoneNoCallsYet' as IntlString
  const NOT_SET_UP = 'chunter:string:ServoneWebhooksNotSetUp' as IntlString
  const ALLOW_MENTIONS = 'chunter:string:ServoneAllowMentions' as IntlString
  const ALLOW_MENTIONS_HINT = 'chunter:string:ServoneAllowMentionsHint' as IntlString
  const allowMentionsText = intl(ALLOW_MENTIONS)
  const RATE_LIMITED = 'chunter:string:ServoneRateLimited' as IntlString

  let isConfigured: boolean | undefined
  let hooks: WebhookSummary[] | undefined
  let failure: string | undefined
  let openLogId: string | undefined

  async function reload (): Promise<void> {
    failure = undefined
    try {
      hooks = await listWebhooks(channel._id)
    } catch (error) {
      if (!(error instanceof ServiceApiError)) throw error
      failure = error.code
    }
  }

  async function init (): Promise<void> {
    isConfigured = (await webhooksServiceUrl()) !== undefined
    if (isConfigured) await reload()
  }

  onMount(() => { void init() })

  function addWebhook (): void {
    showPopup(CreateWebhookPopup, { channel }, undefined, () => {
      void reload()
    })
  }

  function askRevoke (hook: WebhookSummary): void {
    showPopup(MessageBox, {
      label: REVOKE,
      message: REVOKE_CONFIRM,
      params: { name: hook.name },
      okLabel: REVOKE,
      dangerous: true,
      action: async () => {
        await revokeWebhook(hook.id)
        await reload()
      }
    })
  }

  let savingMentionsId: string | undefined

  async function toggleMentions (hook: WebhookSummary, isAllowed: boolean): Promise<void> {
    failure = undefined
    savingMentionsId = hook.id
    try {
      await setAllowMentions(hook.id, isAllowed)
      await reload()
    } catch (error) {
      if (!(error instanceof ServiceApiError)) throw error
      failure = error.code
    } finally {
      savingMentionsId = undefined
    }
  }

  function toggleLog (hook: WebhookSummary): void {
    openLogId = openLogId === hook.id ? undefined : hook.id
  }
</script>

<div class="flex-col gap-2" data-id="channel-webhooks">
  <div class="flex items-start justify-between gap-4">
    <div class="grid gap-1">
      <span class="text-sm font-medium"><Label label={TITLE} /></span>
      <span class="text-xs text-muted-foreground"><Label label={HINT} /></span>
    </div>
    {#if isConfigured === true}
      <ShadButton size="sm" variant="outline" onclick={addWebhook}>
        <Plus />
        <Label label={presentation.string.Add} />
      </ShadButton>
    {/if}
  </div>

  {#if isConfigured === false}
    <span class="text-sm content-dark-color"><Label label={NOT_SET_UP} /></span>
  {:else if failure !== undefined}
    <span class="text-sm error-color">{failure}</span>
  {:else if isConfigured === undefined || hooks === undefined}
    <Loading size="small" />
  {:else if hooks.length === 0}
    <p class="m-0 text-xs text-muted-foreground"><Label label={NO_HOOKS} /></p>
  {:else}
    {#each hooks as hook (hook.id)}
      {@const creator = $employeeRefByAccountUuidStore.get(hook.createdBy)}
      <div class="flex-col gap-2 webhook-row">
        <div class="flex-row-center gap-3">
          <button class="webhook-name" on:click={() => { toggleLog(hook) }}>{hook.name}</button>
          {#if hook.rateLimitedOn !== undefined}
            <span class="rate-limited text-sm"><Label label={RATE_LIMITED} /></span>
          {/if}
          {#if creator !== undefined}
            <span class="text-sm"><PersonRefPresenter value={creator} /></span>
          {/if}
          <span class="text-sm content-dark-color flex-grow">
            {#if hook.lastCall !== undefined}
              <span class="status" class:failed={hook.lastCall.status >= 400}>{hook.lastCall.status}</span>
              <TimeSince value={hook.lastCall.at} />
            {:else}
              <Label label={NO_CALLS} />
            {/if}
          </span>
          {#if hook.revokedOn !== undefined}
            <span class="text-sm content-dark-color"><Label label={REVOKED} /></span>
          {:else}
            <ShadButton variant="destructive" size="sm" onclick={() => { askRevoke(hook) }}><Label label={REVOKE} /></ShadButton>
          {/if}
        </div>
        {#if hook.revokedOn === undefined}
          <div class="flex-row-center gap-2 text-sm">
            <Switch
              size="sm"
              aria-label={$allowMentionsText}
              checked={hook.allowMentions}
              disabled={savingMentionsId === hook.id}
              onCheckedChange={(isOn) => { void toggleMentions(hook, isOn) }}
            />
            <Label label={ALLOW_MENTIONS} />
            <span class="content-dark-color"><Label label={ALLOW_MENTIONS_HINT} /></span>
          </div>
        {/if}
        {#if openLogId === hook.id}
          <WebhookLog hookId={hook.id} />
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style lang="scss">
  .webhook-row {
    padding: 0.5rem 0;
    border-top: 1px solid var(--theme-divider-color);
  }
  .webhook-name {
    font-weight: 500;
    color: var(--theme-caption-color);
    text-align: left;
    cursor: pointer;
  }
  .rate-limited {
    padding: 0 0.25rem;
    border-radius: 0.25rem;
    color: var(--theme-warning-color);
    background-color: var(--theme-button-default);
  }
  .status {
    margin-right: 0.25rem;
    font-variant-numeric: tabular-nums;
    color: var(--theme-won-color);

    &.failed {
      color: var(--theme-lost-color);
    }
  }
</style>
