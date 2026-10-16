<!-- Outgoing webhooks of a channel, shown in channel settings under the incoming ones. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import type { Channel } from '@hcengineering/chunter'
  import presentation, { MessageBox } from '@hcengineering/presentation'
  import { Label, showPopup, TimeSince } from '@hcengineering/ui'
  import { Ellipsis, Plus } from '@lucide/svelte'
  import { Badge } from '../../../lib/components/ui/badge'
  import { Button, buttonVariants } from '../../../lib/components/ui/button'
  import * as DropdownMenu from '../../../lib/components/ui/dropdown-menu'
  import SigningSecretDialog from '../../tracker-resources/webhooks/SigningSecretDialog.svelte'
  import { urlLabel } from '../../tracker-resources/webhooks/api'
  import { webhooksServiceUrl, ServiceApiError } from '../webhooks/api'
  import {
    deleteChatHook,
    editChatHook,
    hookState,
    listChatHooks,
    sendChatTestEvent,
    type ChatHook,
    type TestOutcome
  } from './api'
  import ChatHookDialog from './ChatHookDialog.svelte'
  import ChatHookLogDialog from './ChatHookLogDialog.svelte'
  import { EVENT_LABELS, STATE_LABELS, str } from './strings'

  export let channel: Channel

  type Dialog =
    | { kind: 'add' }
    | { kind: 'edit', hook: ChatHook }
    | { kind: 'secret', secret: string }
    | { kind: 'log', hook: ChatHook }

  type TestNote = { kind: 'answered', outcome: TestOutcome } | { kind: 'failed', error: string } | { kind: 'rateLimited' }

  let isConfigured: boolean | undefined
  let hooks: ChatHook[] | undefined
  let failure: string | undefined
  let dialog: Dialog | undefined
  let testNotes = new Map<string, TestNote>()
  let testing = new Set<string>()

  async function reload (): Promise<void> {
    failure = undefined
    try {
      hooks = await listChatHooks(channel._id)
    } catch (error) {
      if (!(error instanceof ServiceApiError)) throw error
      if (error.code === 'not_configured') isConfigured = false
      else failure = error.code
    }
  }

  async function init (): Promise<void> {
    isConfigured = (await webhooksServiceUrl()) !== undefined
    if (isConfigured) await reload()
  }

  onMount(() => { void init() })

  async function sendTest (hook: ChatHook): Promise<void> {
    testing = new Set(testing).add(hook.id)
    let note: TestNote
    try {
      note = { kind: 'answered', outcome: await sendChatTestEvent(hook.id) }
    } catch (error) {
      if (!(error instanceof ServiceApiError)) throw error
      note = error.status === 429 ? { kind: 'rateLimited' } : { kind: 'failed', error: error.code }
    } finally {
      const next = new Set(testing)
      next.delete(hook.id)
      testing = next
    }
    testNotes = new Map(testNotes).set(hook.id, note)
    await reload()
  }

  async function setEnabled (hook: ChatHook, isEnabled: boolean): Promise<void> {
    try {
      await editChatHook(hook.id, { isEnabled })
    } catch (error) {
      if (!(error instanceof ServiceApiError)) throw error
      failure = error.code
      return
    }
    await reload()
  }

  function confirmDelete (hook: ChatHook): void {
    showPopup(MessageBox, {
      label: str.Delete,
      message: str.DeleteConfirm,
      params: { url: urlLabel(hook.url) },
      okLabel: str.Delete,
      dangerous: true,
      action: async () => {
        await deleteChatHook(hook.id)
        await reload()
      }
    })
  }

  function closeDialog (): void {
    dialog = undefined
  }

  const isAnswerOk = (status: number, error: string | undefined): boolean => error === undefined && status >= 200 && status < 300
</script>

<div class="grid gap-3 border-t pt-3" data-id="channel-chat-hooks">
  <div class="flex items-start justify-between gap-4">
    <div class="grid gap-1">
      <span class="text-sm font-medium"><Label label={str.OutgoingWebhooks} /></span>
      <span class="text-xs text-muted-foreground"><Label label={str.OutgoingWebhooksHint} /></span>
    </div>
    {#if isConfigured === true}
      <Button size="sm" variant="outline" onclick={() => { dialog = { kind: 'add' } }}>
        <Plus />
        <Label label={presentation.string.Add} />
      </Button>
    {/if}
  </div>

  {#if isConfigured === false}
    <p class="m-0 text-sm text-muted-foreground"><Label label={str.Unavailable} /></p>
  {:else if failure !== undefined}
    <p class="m-0 text-sm text-destructive"><Label label={str.Failed} /> ({failure})</p>
  {:else if hooks !== undefined && hooks.length === 0}
    <p class="m-0 text-xs text-muted-foreground"><Label label={str.NoOutgoingWebhooks} /></p>
  {:else if hooks !== undefined}
    <div class="grid divide-y rounded-lg border">
      {#each hooks as hook (hook.id)}
        {@const state = hookState(hook)}
        {@const note = testNotes.get(hook.id)}
        <div class="grid gap-2 px-4 py-3" data-id="chat-hook-row">
          <div class="flex items-center gap-3">
            <span class="min-w-0 flex-1 truncate font-mono text-sm" title={hook.url}>{urlLabel(hook.url)}</span>
            <Badge variant={state === 'active' ? 'secondary' : state === 'offAfterFailures' ? 'destructive' : 'outline'}>
              <Label label={STATE_LABELS[state]} />
            </Badge>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
                <Ellipsis />
                <span class="sr-only"><Label label={str.Actions} /></span>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="w-48">
                <DropdownMenu.Item disabled={testing.has(hook.id)} onSelect={() => { void sendTest(hook) }}>
                  <Label label={str.SendTestEvent} />
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => { dialog = { kind: 'log', hook } }}>
                  <Label label={str.Log} />
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => { dialog = { kind: 'edit', hook } }}>
                  <Label label={str.Edit} />
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => { void setEnabled(hook, state !== 'active') }}>
                  <Label label={state === 'active' ? str.TurnOff : str.TurnOn} />
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item variant="destructive" onSelect={() => { confirmDelete(hook) }}>
                  <Label label={str.Delete} />
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            {#each hook.events as event (event)}
              <Badge variant="outline"><Label label={EVENT_LABELS[event]} /></Badge>
            {/each}
            {#if hook.mentionsOnly}<Badge variant="outline"><Label label={str.MentionsOnly} /></Badge>{/if}
            {#if hook.peopleOnly}<Badge variant="outline"><Label label={str.PeopleOnly} /></Badge>{/if}
            {#if hook.includeIntegrations}<Badge variant="outline"><Label label={str.IncludeIntegrations} /></Badge>{/if}
            <span class="ml-auto text-xs text-muted-foreground tabular-nums">
              {#if hook.lastAttempt !== undefined}
                <span class:text-destructive={!isAnswerOk(hook.lastAttempt.status, hook.lastAttempt.error)}>
                  {hook.lastAttempt.error ?? hook.lastAttempt.status}
                </span>
                · <TimeSince value={hook.lastAttempt.at} />
              {:else}
                <Label label={str.NoAttempts} />
              {/if}
            </span>
          </div>
          {#if note !== undefined}
            <p class="m-0 text-xs" class:text-destructive={note.kind !== 'answered' || !isAnswerOk(note.outcome.status, note.outcome.error)}>
              {#if note.kind === 'answered'}
                <Label
                  label={str.TestEventAnswered}
                  params={{ status: note.outcome.error ?? note.outcome.status, duration: note.outcome.durationMs }}
                />
              {:else if note.kind === 'rateLimited'}
                <Label label={str.TestEventRateLimited} />
              {:else}
                <Label label={str.TestEventFailed} params={{ error: note.error }} />
              {/if}
            </p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if dialog?.kind === 'add' || dialog?.kind === 'edit'}
  <ChatHookDialog
    channel={channel._id}
    hook={dialog.kind === 'edit' ? dialog.hook : undefined}
    onCreated={(created) => {
      dialog = { kind: 'secret', secret: created.secret }
      void reload()
    }}
    onSaved={() => {
      closeDialog()
      void reload()
    }}
    onClose={closeDialog}
  />
{:else if dialog?.kind === 'secret'}
  <SigningSecretDialog secret={dialog.secret} onClose={closeDialog} />
{:else if dialog?.kind === 'log'}
  <ChatHookLogDialog hook={dialog.hook} onClose={closeDialog} />
{/if}
