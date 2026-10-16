<!-- Add an outgoing webhook, or edit the URL, events and filters of one. -->
<script lang="ts">
  import type { Channel } from '@hcengineering/chunter'
  import type { Ref } from '@hcengineering/core'
  import { Label } from '@hcengineering/ui'
  import { Button } from '../../../lib/components/ui/button'
  import { Checkbox } from '../../../lib/components/ui/checkbox'
  import * as Dialog from '../../../lib/components/ui/dialog'
  import { Input } from '../../../lib/components/ui/input'
  import { Switch } from '../../../lib/components/ui/switch'
  import { ServiceApiError } from '../webhooks/api'
  import {
    CHAT_EVENTS,
    createChatHook,
    editChatHook,
    type ChatEventName,
    type ChatHook,
    type ChatHookEdit,
    type CreatedChatHook
  } from './api'
  import { EVENT_LABELS, PROBLEMS, str } from './strings'

  export let channel: Ref<Channel>
  export let hook: ChatHook | undefined = undefined
  export let onCreated: (created: CreatedChatHook) => void
  export let onSaved: () => void
  export let onClose: () => void

  const FILTERS = [
    { key: 'mentionsOnly', label: str.MentionsOnly, hint: str.MentionsOnlyHint },
    { key: 'peopleOnly', label: str.PeopleOnly, hint: str.PeopleOnlyHint },
    { key: 'includeIntegrations', label: str.IncludeIntegrations, hint: str.IncludeIntegrationsHint }
  ] as const

  let url = hook?.url ?? ''
  let events = new Set<ChatEventName>(hook?.events ?? ['message.posted', 'thread.reply'])
  let filters = {
    mentionsOnly: hook?.mentionsOnly ?? false,
    peopleOnly: hook?.peopleOnly ?? false,
    includeIntegrations: hook?.includeIntegrations ?? false
  }
  let isSaving = false
  let problem: ServiceApiError | undefined

  $: isEditing = hook !== undefined
  $: canSave = !isSaving && events.size > 0 && url.trim() !== ''
  $: problemLabel = problem === undefined ? undefined : PROBLEMS[problem.code]

  function toggle (event: ChatEventName, isOn: boolean): void {
    const next = new Set(events)
    if (isOn) next.add(event)
    else next.delete(event)
    events = next
  }

  async function save (): Promise<void> {
    if (!canSave) return
    isSaving = true
    problem = undefined
    const settings = { url: url.trim(), events: CHAT_EVENTS.filter((event) => events.has(event)), ...filters }
    try {
      if (hook === undefined) onCreated(await createChatHook(channel, settings))
      else {
        const edit: ChatHookEdit = { events: settings.events, ...filters }
        if (settings.url !== hook.url) edit.url = settings.url
        await editChatHook(hook.id, edit)
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
  <Dialog.Content class="sm:max-w-md" data-id="chat-hook-dialog">
    <Dialog.Header>
      <Dialog.Title><Label label={isEditing ? str.EditOutgoingWebhook : str.AddOutgoingWebhook} /></Dialog.Title>
    </Dialog.Header>
    <form class="grid gap-4" on:submit|preventDefault={save}>
      <div class="grid gap-1.5">
        <label for="chat-hook-url" class="text-sm font-medium"><Label label={str.ReceiverUrl} /></label>
        <Input
          id="chat-hook-url"
          type="url"
          placeholder="https://hooks.example.com/servone"
          value={url}
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
        <legend class="mb-2 text-sm font-medium"><Label label={str.Events} /></legend>
        <div class="grid grid-cols-2 gap-x-4 gap-y-2">
          {#each CHAT_EVENTS as event (event)}
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
      <fieldset class="m-0 grid gap-3 border-0 p-0">
        <legend class="mb-2 text-sm font-medium"><Label label={str.Filters} /></legend>
        {#each FILTERS as filter (filter.key)}
          <label class="flex cursor-pointer items-start justify-between gap-3">
            <span class="grid gap-0.5">
              <span class="text-sm"><Label label={filter.label} /></span>
              <span class="text-xs text-muted-foreground"><Label label={filter.hint} /></span>
            </span>
            <Switch
              checked={filters[filter.key]}
              onCheckedChange={(isOn) => {
                filters = { ...filters, [filter.key]: isOn }
              }}
            />
          </label>
        {/each}
      </fieldset>
      <p class="m-0 text-xs text-muted-foreground"><Label label={str.DataNote} /></p>
      {#if problem !== undefined && problem.field !== 'url'}
        <p class="m-0 text-xs text-destructive">
          <Label label={problemLabel ?? str.SaveFailed} params={{ code: problem.code }} />
        </p>
      {/if}
      <Dialog.Footer>
        <Button variant="outline" type="button" onclick={onClose}><Label label={str.Cancel} /></Button>
        <Button type="submit" disabled={!canSave}><Label label={isEditing ? str.Save : str.AddOutgoingWebhook} /></Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
