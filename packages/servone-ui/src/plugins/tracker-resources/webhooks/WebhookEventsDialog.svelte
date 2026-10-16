<!-- Add a webhook (URL and events), or change the events of an existing one; the URL of a saved hook is fixed. -->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import type { Project } from '@hcengineering/tracker'
  import { Label } from '@hcengineering/ui'
  import { Button } from '../../../lib/components/ui/button'
  import { Checkbox } from '../../../lib/components/ui/checkbox'
  import * as Dialog from '../../../lib/components/ui/dialog'
  import { Input } from '../../../lib/components/ui/input'
  import { str } from '../sprints/plugin'
  import { ServiceApiError } from '../../chunter-resources/webhooks/api'
  import {
    createHook,
    editHook,
    TRACKER_EVENTS,
    type CreatedHook,
    type TrackerEvent,
    type TrackerHook
  } from './api'
  import { EVENT_LABELS } from './labels'

  export let project: Ref<Project>
  export let hook: TrackerHook | undefined = undefined
  export let onCreated: (created: CreatedHook) => void
  export let onSaved: () => void
  export let onClose: () => void

  const PROBLEMS: Record<string, IntlString> = {
    refused_address: str.WebhookRefusedAddress,
    unresolvable_host: str.WebhookUnresolvableHost,
    not_https: str.WebhookNotHttps,
    has_credentials: str.WebhookHasCredentials,
    too_long: str.WebhookUrlTooLong,
    invalid_url: str.WebhookInvalidUrl,
    empty: str.WebhookNoEvents,
    too_many_hooks: str.WebhookTooMany
  }

  let url = hook?.url ?? ''
  let events = new Set<TrackerEvent>(hook?.events ?? ['issue.created', 'issue.status_changed', 'comment.added'])
  let isSaving = false
  let problem: ServiceApiError | undefined

  $: isEditing = hook !== undefined
  $: canSave = !isSaving && events.size > 0 && url.trim() !== ''
  $: problemLabel = problem === undefined ? undefined : PROBLEMS[problem.code]

  function toggle (event: TrackerEvent, isOn: boolean): void {
    const next = new Set(events)
    if (isOn) next.add(event)
    else next.delete(event)
    events = next
  }

  async function save (): Promise<void> {
    if (!canSave) return
    isSaving = true
    problem = undefined
    const chosen = TRACKER_EVENTS.filter((event) => events.has(event))
    try {
      if (hook === undefined) onCreated(await createHook(project, url.trim(), chosen))
      else {
        await editHook(hook.id, { events: chosen })
        onSaved()
      }
    } catch (error) {
      if (!(error instanceof ServiceApiError)) throw error
      problem = error
    } finally {
      isSaving = false
    }
  }
</script>

<Dialog.Root
  open
  onOpenChange={(isOpen) => {
    if (!isOpen) onClose()
  }}
>
  <Dialog.Content class="sm:max-w-md" data-id="tracker-webhook-dialog">
    <Dialog.Header>
      <Dialog.Title><Label label={isEditing ? str.EditEvents : str.AddWebhook} /></Dialog.Title>
    </Dialog.Header>
    <form class="grid gap-4" on:submit|preventDefault={save}>
      <div class="grid gap-1.5">
        <label for="tracker-webhook-url" class="text-sm font-medium"><Label label={str.WebhookUrl} /></label>
        <Input
          id="tracker-webhook-url"
          type="url"
          placeholder="https://hooks.example.com/servone"
          value={url}
          disabled={isEditing}
          aria-invalid={problem?.field === 'url'}
          oninput={(ev) => {
            url = ev.currentTarget.value
          }}
        />
        {#if problem?.field === 'url' && problemLabel !== undefined}
          <p class="m-0 text-xs text-destructive"><Label label={problemLabel} /></p>
        {/if}
      </div>
      <fieldset class="m-0 grid gap-2 border-0 p-0">
        <legend class="mb-2 text-sm font-medium"><Label label={str.WebhookEvents} /></legend>
        <div class="grid grid-cols-2 gap-x-4 gap-y-2">
          {#each TRACKER_EVENTS as event (event)}
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={events.has(event)}
                onCheckedChange={(isOn) => {
                  toggle(event, isOn)
                }}
              />
              <Label label={EVENT_LABELS[event]} />
            </label>
          {/each}
        </div>
      </fieldset>
      <p class="m-0 text-xs text-muted-foreground"><Label label={str.WebhookDataNote} /></p>
      {#if problem !== undefined && problem.field !== 'url'}
        <p class="m-0 text-xs text-destructive">
          <Label label={problemLabel ?? str.WebhookSaveFailed} params={{ code: problem.code }} />
        </p>
      {/if}
      <Dialog.Footer>
        <Button variant="outline" type="button" onclick={onClose}><Label label={str.Cancel} /></Button>
        <Button type="submit" disabled={!canSave}><Label label={isEditing ? str.Save : str.AddWebhook} /></Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
