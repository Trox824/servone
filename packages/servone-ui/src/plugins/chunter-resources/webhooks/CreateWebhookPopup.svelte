<script lang="ts">
  import type { Channel } from '@hcengineering/chunter'
  import type { IntlString } from '@hcengineering/platform'
  import presentation, { copyTextToClipboard } from '@hcengineering/presentation'
  import { Button, EditBox, IconCopy, Label, Modal } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { createWebhook, ServiceApiError, type CreatedWebhook } from './api'

  export let channel: Channel

  const ADD_WEBHOOK = 'chunter:string:ServoneAddWebhook' as IntlString
  const NAME = 'chunter:string:ServoneWebhookName' as IntlString
  const COPY_ONCE = 'chunter:string:ServoneWebhookCopyOnce' as IntlString
  const COPY_URL = 'chunter:string:ServoneCopyUrl' as IntlString
  const NATIVE_URL = 'chunter:string:ServoneWebhookNativeUrl' as IntlString
  const SLACK_URL = 'chunter:string:ServoneWebhookSlackUrl' as IntlString
  const SLACK_HINT = 'chunter:string:ServoneWebhookSlackHint' as IntlString
  const MAX_NAME_LENGTH = 80

  const dispatch = createEventDispatcher()

  let name = ''
  let created: CreatedWebhook | undefined
  let isSaving = false
  let failure: string | undefined

  $: trimmed = name.trim()
  $: canSave = created !== undefined || (trimmed !== '' && trimmed.length <= MAX_NAME_LENGTH && !isSaving)

  async function save (): Promise<void> {
    if (created !== undefined) {
      dispatch('close', created)
      return
    }
    isSaving = true
    failure = undefined
    try {
      created = await createWebhook(channel._id, trimmed)
    } catch (error) {
      if (!(error instanceof ServiceApiError)) throw error
      failure = error.code
    } finally {
      isSaving = false
    }
  }
</script>

<Modal
  label={ADD_WEBHOOK}
  type="type-popup"
  width="small"
  okLabel={created === undefined ? ADD_WEBHOOK : presentation.string.Close}
  okAction={save}
  okLoading={isSaving}
  {canSave}
  showCancelButton={created === undefined}
  onCancel={() => {
    dispatch('close', created)
  }}
>
  {#if created === undefined}
    <div class="flex-col gap-2">
      <EditBox bind:value={name} placeholder={NAME} kind="large-style" autoFocus />
      {#if failure !== undefined}
        <span class="text-sm error-color">{failure}</span>
      {/if}
    </div>
  {:else}
    <div class="flex-col gap-3">
      <span class="text-sm"><Label label={COPY_ONCE} /></span>
      {#each [{ label: NATIVE_URL, url: created.url, hint: undefined }, { label: SLACK_URL, url: created.slackUrl, hint: SLACK_HINT }] as address (address.url)}
        <div class="flex-col gap-1">
          <span class="text-sm font-medium"><Label label={address.label} /></span>
          {#if address.hint !== undefined}
            <span class="text-sm content-dark-color"><Label label={address.hint} /></span>
          {/if}
          <code class="webhook-url">{address.url}</code>
          <div>
            <Button
              icon={IconCopy}
              label={COPY_URL}
              on:click={() => {
                void copyTextToClipboard(address.url)
              }}
            />
          </div>
        </div>
      {/each}
    </div>
  {/if}
</Modal>

<style lang="scss">
  .webhook-url {
    padding: 0.5rem;
    border-radius: 0.25rem;
    background-color: var(--theme-button-default);
    word-break: break-all;
    user-select: all;
  }
</style>
