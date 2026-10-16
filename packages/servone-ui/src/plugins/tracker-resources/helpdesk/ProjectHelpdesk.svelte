<!-- A workflow's SLA & automation tab: SLA targets, auto-close and auto-archive read by services/servone/src/helpdesk,
     and the handoff rule read by services/servone/src/handoff. -->
<script lang="ts">
  import type { Person } from '@hcengineering/contact'
  import { AssigneePopup, PersonRefPresenter } from '@hcengineering/contact-resources'
  import { getCurrentAccount, type Class, type Ref } from '@hcengineering/core'
  import { translate, type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tracker, { type Project } from '@hcengineering/tracker'
  import task from '@hcengineering/task'
  import { Label, showPopup, themeStore } from '@hcengineering/ui'
  import { statusStore } from '@hcengineering/view-resources'
  import {
    AUTO_ARCHIVE_MONTHS,
    HANDOFF_ASSIGNEES,
    parseHandoff,
    parseHelpdeskSettings,
    SLA_PRIORITIES,
    type Handoff,
    type HelpdeskSettings,
    type SlaPriority,
    type StoredHandoff,
    type StoredHelpdesk
  } from '@servone/notify-rules'
  import { Button } from '../../../lib/components/ui/button'
  import { Input } from '../../../lib/components/ui/input'
  import * as Select from '../../../lib/components/ui/select'
  import { canManageHooks } from '../webhooks/api'
  import { isWorkflowType } from '../workflows/nav'
  import { draftOf, handoffOf, helpdeskUpdate, isValidCount, type HelpdeskDraft } from './draft'
  import { str } from './strings'

  export let currentSpace: Ref<Project>

  interface HelpdeskProject extends Project, StoredHelpdesk, StoredHandoff {}
  const helpdeskProjectClass: Ref<Class<HelpdeskProject>> = tracker.class.Project

  const PRIORITY_LABELS: Record<SlaPriority, IntlString> = {
    urgent: str.Urgent,
    high: str.High,
    medium: str.Medium,
    low: str.Low
  }
  const TARGETS = ['respond', 'resolve'] as const
  const ASSIGNEE_LABELS: Record<(typeof HANDOFF_ASSIGNEES)[number], IntlString> = {
    none: str.AssignNone,
    same: str.AssignSame,
    person: str.AssignPerson
  }

  const client = getClient()
  const account = getCurrentAccount()

  let project: HelpdeskProject | undefined
  let saved: HelpdeskSettings = {}
  let savedHandoff: Handoff | undefined
  let draft: HelpdeskDraft = draftOf({}, undefined)
  let isSaving = false
  let isJustSaved = false

  function onProject (found: HelpdeskProject[]): void {
    const wasDirty = project !== undefined && JSON.stringify(draft) !== JSON.stringify(draftOf(saved, savedHandoff))
    project = found[0]
    saved = project === undefined ? {} : parseHelpdeskSettings(project)
    savedHandoff = project === undefined ? undefined : parseHandoff(project)
    if (!wasDirty) draft = draftOf(saved, savedHandoff)
  }
  const projectQuery = createQuery()
  $: projectQuery.query(helpdeskProjectClass, { _id: currentSpace }, onProject)

  $: canEdit = project !== undefined && canManageHooks(account.role, account.uuid, project.owners ?? [])
  $: isDirty = JSON.stringify(draft) !== JSON.stringify(draftOf(saved, savedHandoff))
  $: update = helpdeskUpdate(draft, saved, Date.now())
  $: isHandoffIncomplete = handoffOf(draft.handoff) === null

  $: stages = (project === undefined ? [] : client.getModel().findAllSync(task.class.TaskType, { parent: project.type }))
    .flatMap((kind) => kind.statuses)
    .map((status) => ({ value: String(status), label: $statusStore.byId.get(status)?.name ?? '' }))

  let workflows: Project[] = []
  const workflowsQuery = createQuery()
  $: workflowsQuery.query(tracker.class.Project, { archived: false }, (found) => {
    workflows = found.filter((other) => other._id !== currentSpace && isWorkflowType(other.type))
  })

  let offLabel = ''
  let noTargetLabel = ''
  let assigneeLabels = new Map<string, string>()
  async function translateHandoff (lang: string): Promise<void> {
    offLabel = await translate(str.Off, {}, lang)
    noTargetLabel = await translate(str.NoTarget, {}, lang)
    const choices = await Promise.all(
      HANDOFF_ASSIGNEES.map(async (kind) => [kind, await translate(ASSIGNEE_LABELS[kind], {}, lang)] as const)
    )
    assigneeLabels = new Map(choices)
  }
  $: void translateHandoff($themeStore.language)

  let personButton: HTMLButtonElement
  function choosePerson (): void {
    showPopup(AssigneePopup, { docQuery: { active: true }, selected: draft.handoff.person }, personButton, (person: Person | undefined) => {
      if (person !== undefined) draft.handoff.person = person._id
    })
  }

  let archiveLabels = new Map<string, string>()
  async function translateArchive (lang: string): Promise<void> {
    const off = await translate(str.Off, {}, lang)
    const choices = await Promise.all(
      AUTO_ARCHIVE_MONTHS.map(async (months) => [String(months), await translate(str.Months, { months }, lang)] as const)
    )
    archiveLabels = new Map([['', off], ...choices])
  }
  $: void translateArchive($themeStore.language)

  async function save (): Promise<void> {
    if (project === undefined || update === undefined) return
    isSaving = true
    try {
      await client.updateDoc(helpdeskProjectClass, project.space, project._id, update)
    } finally {
      isSaving = false
    }
    isJustSaved = true
  }

  $: if (isDirty) isJustSaved = false
</script>

<div class="h-full min-h-0 overflow-y-auto" data-id="project-helpdesk">
  <form class="mx-auto grid w-full max-w-3xl gap-6 p-6" on:submit|preventDefault={save}>
    <div class="grid gap-1">
      <h2 class="m-0 text-lg font-semibold"><Label label={str.SlaAutomation} /></h2>
      <p class="m-0 text-sm text-muted-foreground">
        <Label label={canEdit ? str.SlaHint : str.ReadOnly} />
      </p>
    </div>

    <section class="overflow-hidden rounded-lg border">
      <div class="grid h-9 grid-cols-[1fr_9rem_9rem] items-center gap-3 bg-muted/50 px-3 text-sm font-medium">
        <span><Label label={str.Priority} /></span>
        <span id="sla-respond"><Label label={str.FirstResponse} /></span>
        <span id="sla-resolve"><Label label={str.Resolution} /></span>
      </div>
      <div class="divide-y border-t">
        {#each SLA_PRIORITIES as priority (priority)}
          <div class="grid h-11 grid-cols-[1fr_9rem_9rem] items-center gap-3 px-3">
            <span id="sla-{priority}" class="text-sm"><Label label={PRIORITY_LABELS[priority]} /></span>
            {#each TARGETS as target (target)}
              <label class="flex items-center gap-1.5">
                <Input
                  class="h-7 text-right tabular-nums"
                  inputmode="numeric"
                  placeholder={noTargetLabel}
                  aria-labelledby="sla-{priority} sla-{target}"
                  disabled={!canEdit}
                  aria-invalid={!isValidCount(draft.targets[priority][target])}
                  bind:value={draft.targets[priority][target]}
                />
                <span class="w-8 shrink-0 text-xs text-muted-foreground"><Label label={str.Hours} /></span>
              </label>
            {/each}
          </div>
        {/each}
      </div>
    </section>

    <div class="grid gap-4">
      <div class="flex items-center gap-4">
        <div class="grid flex-1 gap-0.5">
          <span class="text-sm font-medium"><Label label={str.AutoClose} /></span>
          <span class="text-xs text-muted-foreground"><Label label={str.AutoCloseHint} /></span>
        </div>
        <label class="flex w-[9rem] shrink-0 items-center gap-1.5">
          <Input
            class="h-7 text-right tabular-nums"
            inputmode="numeric"
            disabled={!canEdit}
            aria-invalid={!isValidCount(draft.autoCloseDays)}
            bind:value={draft.autoCloseDays}
          />
          <span class="w-8 shrink-0 text-xs text-muted-foreground"><Label label={str.Days} /></span>
        </label>
      </div>

      <div class="flex items-center gap-4">
        <div class="grid flex-1 gap-0.5">
          <span class="text-sm font-medium"><Label label={str.AutoArchive} /></span>
          <span class="text-xs text-muted-foreground"><Label label={str.AutoArchiveHint} /></span>
        </div>
        <Select.Root type="single" disabled={!canEdit} bind:value={draft.autoArchiveMonths}>
          <Select.Trigger class="h-7 w-[9rem] shrink-0">{archiveLabels.get(draft.autoArchiveMonths) ?? ''}</Select.Trigger>
          <Select.Content>
            {#each archiveLabels as [value, text] (value)}
              <Select.Item {value} label={text} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>

    <section class="grid gap-3 rounded-lg border p-3" data-id="workflow-handoff">
      <div class="grid gap-0.5">
        <span class="text-sm font-medium"><Label label={str.Handoff} /></span>
        <span class="text-xs text-muted-foreground"><Label label={str.HandoffHint} /></span>
      </div>
      <div class="flex items-center gap-4">
        <span class="flex-1 text-sm"><Label label={str.HandoffStage} /></span>
        <Select.Root type="single" disabled={!canEdit} bind:value={draft.handoff.stage}>
          <Select.Trigger class="h-7 w-[14rem] shrink-0">
            <span class="truncate">{stages.find((stage) => stage.value === draft.handoff.stage)?.label ?? offLabel}</span>
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="" label={offLabel} />
            {#each stages as stage (stage.value)}
              <Select.Item value={stage.value} label={stage.label} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="flex items-center gap-4">
        <span class="flex-1 text-sm"><Label label={str.HandoffTarget} /></span>
        <Select.Root type="single" disabled={!canEdit} bind:value={draft.handoff.target}>
          <Select.Trigger class="h-7 w-[14rem] shrink-0">
            <span class="truncate">{workflows.find((other) => other._id === draft.handoff.target)?.name ?? offLabel}</span>
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="" label={offLabel} />
            {#each workflows as other (other._id)}
              <Select.Item value={other._id} label={other.name} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="flex items-center gap-4">
        <span class="flex-1 text-sm"><Label label={str.HandoffAssignee} /></span>
        {#if draft.handoff.assignee === 'person'}
          <button
            type="button"
            class="flex h-7 items-center gap-2 rounded-md px-2 text-sm enabled:hover:bg-muted"
            disabled={!canEdit}
            bind:this={personButton}
            on:click={choosePerson}
          >
            {#if draft.handoff.person === ''}
              <span class="text-muted-foreground"><Label label={str.ChoosePerson} /></span>
            {:else}
              <PersonRefPresenter value={draft.handoff.person} disabled />
            {/if}
          </button>
        {/if}
        <Select.Root type="single" disabled={!canEdit} bind:value={draft.handoff.assignee}>
          <Select.Trigger class="h-7 w-[14rem] shrink-0">{assigneeLabels.get(draft.handoff.assignee) ?? ''}</Select.Trigger>
          <Select.Content>
            {#each assigneeLabels as [value, text] (value)}
              <Select.Item {value} label={text} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </section>

    {#if canEdit}
      <div class="sticky bottom-0 z-10 -mx-6 -mb-6 flex items-center justify-end gap-3 border-t bg-background px-6 py-3">
        {#if update === undefined}
          <span class="text-xs text-destructive"><Label label={isHandoffIncomplete ? str.HandoffIncomplete : str.InvalidCount} /></span>
        {:else if isJustSaved}
          <span class="text-xs text-muted-foreground"><Label label={str.Saved} /></span>
        {/if}
        <Button type="submit" size="sm" disabled={!isDirty || update === undefined || isSaving}>
          <Label label={str.Save} />
        </Button>
      </div>
    {/if}
  </form>
</div>
