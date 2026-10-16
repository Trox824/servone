<!-- A project's Webhooks tab (More page): outside receivers of this project's issue events. -->
<script lang="ts">
  import { getCurrentAccount, type Ref } from '@hcengineering/core'
  import { createQuery, MessageBox } from '@hcengineering/presentation'
  import tracker, { type Project } from '@hcengineering/tracker'
  import { Label, showPopup, TimeSince } from '@hcengineering/ui'
  import { Ellipsis, Plus, Webhook } from '@lucide/svelte'
  import { Badge } from '../../../lib/components/ui/badge'
  import { Button, buttonVariants } from '../../../lib/components/ui/button'
  import * as DropdownMenu from '../../../lib/components/ui/dropdown-menu'
  import { str } from '../sprints/plugin'
  import { ServiceApiError } from '../../chunter-resources/webhooks/api'
  import {
    canManageHooks,
    deleteHook,
    editHook,
    hookState,
    isServiceConfigured,
    listHooks,
    sendTestEvent,
    urlLabel,
    type TestOutcome,
    type TrackerHook
  } from './api'
  import { EVENT_LABELS, STATE_LABELS } from './labels'
  import SigningSecretDialog from './SigningSecretDialog.svelte'
  import WebhookEventsDialog from './WebhookEventsDialog.svelte'
  import WebhookLogDialog from './WebhookLogDialog.svelte'

  export let currentSpace: Ref<Project>

  type Dialog =
    | { kind: 'add' }
    | { kind: 'edit', hook: TrackerHook }
    | { kind: 'secret', secret: string }
    | { kind: 'log', hook: TrackerHook }

  type TestNote = { kind: 'answered', outcome: TestOutcome } | { kind: 'failed', error: string } | { kind: 'rateLimited' }

  const account = getCurrentAccount()

  let project: Project | undefined
  const projectQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (found) => {
    project = found[0]
  })

  $: isManager = project !== undefined && canManageHooks(account.role, account.uuid, project.owners ?? [])

  let isConfigured: boolean | undefined
  let hooks: TrackerHook[] | undefined
  let failure: string | undefined
  let dialog: Dialog | undefined
  let testNotes = new Map<string, TestNote>()
  let testing = new Set<string>()

  async function reload (): Promise<void> {
    failure = undefined
    try {
      hooks = await listHooks(currentSpace)
    } catch (error) {
      if (!(error instanceof ServiceApiError)) throw error
      if (error.code === 'not_configured') isConfigured = false
      else failure = error.code
    }
  }

  async function init (): Promise<void> {
    isConfigured = await isServiceConfigured()
    if (isConfigured) await reload()
  }

  $: if (isManager) void init()

  async function sendTest (hook: TrackerHook): Promise<void> {
    testing = new Set(testing).add(hook.id)
    let note: TestNote
    try {
      note = { kind: 'answered', outcome: await sendTestEvent(hook.id) }
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

  async function setEnabled (hook: TrackerHook, isEnabled: boolean): Promise<void> {
    await editHook(hook.id, { isEnabled })
    await reload()
  }

  function confirmDelete (hook: TrackerHook): void {
    showPopup(MessageBox, {
      label: str.DeleteWebhook,
      message: str.DeleteWebhookConfirm,
      params: { url: urlLabel(hook.url) },
      okLabel: str.DeleteWebhook,
      dangerous: true,
      action: async () => {
        await deleteHook(hook.id)
        await reload()
      }
    })
  }

  function closeDialog (): void {
    dialog = undefined
  }

  const isAnswerOk = (status: number, error: string | undefined): boolean => error === undefined && status >= 200 && status < 300
</script>

<div class="h-full min-h-0 overflow-y-auto" data-id="tracker-webhooks">
  <div class="mx-auto grid w-full max-w-3xl gap-6 p-6">
    <div class="flex items-start justify-between gap-4">
      <div class="grid gap-1">
        <h2 class="m-0 text-lg font-semibold"><Label label={str.Webhooks} /></h2>
        <p class="m-0 text-sm text-muted-foreground"><Label label={str.WebhooksHint} /></p>
      </div>
      {#if isManager && isConfigured === true}
        <Button size="sm" onclick={() => { dialog = { kind: 'add' } }}>
          <Plus />
          <Label label={str.AddWebhook} />
        </Button>
      {/if}
    </div>

    {#if project !== undefined && !isManager}
      <p class="m-0 text-sm text-muted-foreground"><Label label={str.WebhooksOwnersOnly} /></p>
    {:else if isConfigured === false}
      <p class="m-0 text-sm text-muted-foreground"><Label label={str.WebhooksUnavailable} /></p>
    {:else if failure !== undefined}
      <p class="m-0 text-sm text-destructive"><Label label={str.WebhooksFailed} /> ({failure})</p>
    {:else if hooks !== undefined && hooks.length === 0}
      <div class="grid justify-items-center gap-2 rounded-lg border border-dashed p-10 text-center">
        <Webhook class="size-6 text-muted-foreground" />
        <p class="m-0 max-w-sm text-sm text-muted-foreground"><Label label={str.NoWebhooks} /></p>
      </div>
    {:else if hooks !== undefined}
      <div class="grid divide-y rounded-lg border">
        {#each hooks as hook (hook.id)}
          {@const state = hookState(hook)}
          {@const note = testNotes.get(hook.id)}
          <div class="grid gap-2 px-4 py-3" data-id="tracker-webhook-row">
            <div class="flex items-center gap-3">
              <span class="min-w-0 flex-1 truncate font-mono text-sm" title={hook.url}>{urlLabel(hook.url)}</span>
              <Badge variant={state === 'active' ? 'secondary' : state === 'offAfterFailures' ? 'destructive' : 'outline'}>
                <Label label={STATE_LABELS[state]} />
              </Badge>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
                  <Ellipsis />
                  <span class="sr-only"><Label label={str.WebhookActions} /></span>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" class="w-48">
                  <DropdownMenu.Item disabled={testing.has(hook.id)} onSelect={() => { void sendTest(hook) }}>
                    <Label label={str.SendTestEvent} />
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => { dialog = { kind: 'log', hook } }}>
                    <Label label={str.WebhookLog} />
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => { dialog = { kind: 'edit', hook } }}>
                    <Label label={str.EditEvents} />
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => { void setEnabled(hook, state !== 'active') }}>
                    <Label label={state === 'active' ? str.TurnOffWebhook : str.TurnOnWebhook} />
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item variant="destructive" onSelect={() => { confirmDelete(hook) }}>
                    <Label label={str.DeleteWebhook} />
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              {#each hook.events as event (event)}
                <Badge variant="outline"><Label label={EVENT_LABELS[event]} /></Badge>
              {/each}
              <span class="ml-auto text-xs text-muted-foreground tabular-nums">
                {#if hook.lastAttempt !== undefined}
                  <span class:text-destructive={!isAnswerOk(hook.lastAttempt.status, hook.lastAttempt.error)}>
                    {hook.lastAttempt.error ?? hook.lastAttempt.status}
                  </span>
                  · <TimeSince value={hook.lastAttempt.at} />
                {:else}
                  <Label label={str.WebhookNoAttempts} />
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
</div>

{#if dialog?.kind === 'add' || dialog?.kind === 'edit'}
  <WebhookEventsDialog
    project={currentSpace}
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
  <WebhookLogDialog hook={dialog.hook} onClose={closeDialog} />
{/if}
