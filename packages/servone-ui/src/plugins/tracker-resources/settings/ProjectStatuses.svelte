<!-- A project's Statuses tab: its workflow grouped by category in board order. Also mounted by Quy trình (SRV-20). -->
<script lang="ts">
  import contact, { type Employee, type Person } from '@hcengineering/contact'
  import { AssigneePopup, PersonRefPresenter } from '@hcengineering/contact-resources'
  import core, { type Doc, getCurrentAccount, type Ref, type RefTo, type Status, type StatusCategory } from '@hcengineering/core'
  import { type IntlString, translate, translateCB } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task, { type ProjectType } from '@hcengineering/task'
  import tracker, { type IssueStatus, type Project } from '@hcengineering/tracker'
  import {
    addNotification,
    eventToHTMLElement,
    getPlatformColorDef,
    Label,
    NotificationSeverity,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import { ColorsPopup, SimpleNotification, statusStore } from '@hcengineering/view-resources'
  import {
    addStatus,
    type ApproverRule,
    CATEGORIES,
    ConfigError,
    deleteStatus,
    moveStatus,
    projectStatusGroups,
    renameStatus,
    setDefaultStatus,
    setStatusApproval,
    setStatusColor,
    setTriage,
    type ProjectStatusGroup,
    type ProjectStatusRow,
    triageProjectClass
  } from '@servone/config'
  import { Check, Ellipsis, GripVertical, Plus, ShieldCheck } from '@lucide/svelte'
  import { Badge } from '../../../lib/components/ui/badge'
  import { Button, buttonVariants } from '../../../lib/components/ui/button'
  import * as DropdownMenu from '../../../lib/components/ui/dropdown-menu'
  import { Input } from '../../../lib/components/ui/input'
  import { Switch } from '../../../lib/components/ui/switch'
  import IssueStatusIcon from '../components/issues/IssueStatusIcon.svelte'
  import { str } from '../sprints/plugin'
  import { canSetUp } from '../sprints/setup'
  import { isWorkflowType } from '../workflows/nav'
  import DeleteStatusDialog from './DeleteStatusDialog.svelte'
  import { deleteBlock, dropIndex } from './statuses'

  export let currentSpace: Ref<Project>

  const CATEGORY_LABELS = [str.StatusBacklog, str.StatusTodo, str.StatusInProgress, str.StatusDone, str.StatusCanceled]
  const WORKFLOW_CATEGORY_LABELS = [
    str.WorkflowStatusNotStarted,
    str.WorkflowStatusToDo,
    str.StatusInProgress,
    str.WorkflowStatusFinished,
    str.StatusCanceled
  ]
  $: groupLabel = (group: ProjectStatusGroup): IntlString =>
    group.isTriage ? triageStr : (isWorkflow ? WORKFLOW_CATEGORY_LABELS : CATEGORY_LABELS)[CATEGORIES.indexOf(group.category)]
  const DEFAULT_CATEGORIES = CATEGORIES.slice(0, 2)
  const CLOSED_CATEGORIES = CATEGORIES.slice(3)

  const canEdit = canSetUp()
  const client = getClient()
  const session = { client, account: getCurrentAccount() }

  let groups: ProjectStatusGroup[] | undefined
  let loadId = 0
  let renaming: Ref<Status> | undefined
  let addingTo: Ref<StatusCategory> | undefined
  let draft = ''
  let dragged: { category: Ref<StatusCategory>, index: number } | undefined
  let dropAt: { category: Ref<StatusCategory>, index: number, isAfter: boolean } | undefined
  let deleting: { row: ProjectStatusRow, targets: ProjectStatusRow[], initial: Ref<Status> } | undefined
  let namePlaceholder = ''
  let triageLabel = ''
  let personFields: Array<{ name: string, label: IntlString }> = []
  let triage: { status: Ref<IssueStatus>, owner: Ref<Employee> } | undefined
  let isTriageOn = false
  let isWorkflow = false
  $: triageStr = isWorkflow ? str.WorkflowTriage : str.Triage
  let triageOwnerButton: HTMLElement
  const rowElements: Record<Ref<Status>, HTMLElement> = {}

  $: translateCB(str.StatusNamePlaceholder, {}, $themeStore.language, (text) => { namePlaceholder = text })
  $: translateCB(triageStr, {}, $themeStore.language, (text) => { triageLabel = text })

  async function load (project: Ref<Project>): Promise<void> {
    const id = ++loadId
    const loaded = await projectStatusGroups(session, project)
    const found = await client.findOne(triageProjectClass, { _id: project })
    if (id !== loadId) return
    groups = loaded
    personFields = found === undefined ? [] : personFieldsOf(found.type)
    isWorkflow = found !== undefined && isWorkflowType(found.type)
    const status = found?.servoneTriageStatus
    const owner = found?.servoneTriageOwner
    triage = status !== undefined && owner !== undefined ? { status, owner } : undefined
    isTriageOn = triage !== undefined
  }

  function personFieldsOf (type: Ref<ProjectType>): Array<{ name: string, label: IntlString }> {
    const hierarchy = client.getHierarchy()
    const fields = new Map<string, IntlString>()
    for (const kind of client.getModel().findAllSync(task.class.TaskType, { parent: type })) {
      for (const attr of hierarchy.getAllAttributes(kind.targetClass).values()) {
        const isPersonRef = attr.type._class === core.class.RefTo &&
          hierarchy.isDerived((attr.type as RefTo<Doc>).to, contact.class.Person)
        if (isPersonRef && attr.hidden !== true) fields.set(attr.name, attr.label)
      }
    }
    return [...fields].map(([name, label]) => ({ name, label }))
  }

  function approve (row: ProjectStatusRow, rule: ApproverRule | undefined): void {
    void run(async () => { await setStatusApproval(session, currentSpace, row.status, rule) })
  }

  function pickApprover (row: ProjectStatusRow): void {
    const selected = row.approval?.by === 'person' ? row.approval.person : undefined
    showPopup(AssigneePopup, { docQuery: { active: true }, selected }, rowElements[row.status], (person: Person | undefined) => {
      if (person !== undefined) approve(row, { by: 'person', person: person._id })
    })
  }

  const typeQuery = createQuery()
  const statusQuery = createQuery()
  $: typeQuery.query(task.class.ProjectType, {}, () => { void load(currentSpace) })
  $: statusQuery.query(tracker.class.IssueStatus, {}, () => { void load(currentSpace) })

  function pickTriageOwner (onPick: (owner: Ref<Employee>) => void, onCancel = (): void => {}): void {
    showPopup(AssigneePopup, { docQuery: { active: true }, selected: triage?.owner }, triageOwnerButton, (person: Employee | undefined) => {
      if (person === undefined) onCancel()
      else onPick(person._id)
    })
  }

  async function turnTriageOn (owner: Ref<Employee>): Promise<void> {
    const name = await translate(triageStr, {}, $themeStore.language)
    const key = name.toLowerCase()
    const existing = (groups ?? []).flatMap((it) => it.rows).find((it) => it.name.trim().toLowerCase() === key)
    const status = existing?.status ?? (await addStatus(session, currentSpace, { name, category: task.statusCategory.UnStarted }))
    await setTriage(session, currentSpace, { status, owner })
  }

  function toggleTriage (isOn: boolean): void {
    if (!isOn) {
      void run(async () => { await setTriage(session, currentSpace, undefined) })
      return
    }
    pickTriageOwner((owner) => { void run(async () => { await turnTriageOn(owner) }) }, () => { isTriageOn = false })
  }

  function changeTriageOwner (): void {
    const status = triage?.status
    if (status === undefined) return
    pickTriageOwner((owner) => { void run(async () => { await setTriage(session, currentSpace, { status, owner }) }) })
  }

  async function run (edit: () => Promise<void>): Promise<void> {
    try {
      await edit()
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err
      addNotification(await translate(str.StatusChangeFailed, {}, $themeStore.language), err.message, SimpleNotification, undefined, NotificationSeverity.Error)
    }
    await load(currentSpace)
  }

  function startRename (row: ProjectStatusRow): void {
    addingTo = undefined
    renaming = row.status
    draft = row.name
  }

  function startAdd (category: Ref<StatusCategory>): void {
    renaming = undefined
    addingTo = category
    draft = ''
  }

  function commitRename (row: ProjectStatusRow): void {
    if (renaming !== row.status) return
    const name = draft.trim()
    renaming = undefined
    if (name !== '' && name !== row.name) void run(async () => { await renameStatus(session, currentSpace, row.status, name) })
  }

  function commitAdd (category: Ref<StatusCategory>): void {
    if (addingTo !== category) return
    const name = draft.trim()
    addingTo = undefined
    if (name !== '') void run(async () => { await addStatus(session, currentSpace, { name, category }) })
  }

  function onDraftKey (e: KeyboardEvent, commit: () => void): void {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') {
      renaming = undefined
      addingTo = undefined
    }
  }

  function pickColor (e: MouseEvent, row: ProjectStatusRow): void {
    const selected = typeof row.color === 'number' ? getPlatformColorDef(row.color, $themeStore.dark).name : undefined
    showPopup(ColorsPopup, { selected }, eventToHTMLElement(e), (color: number | undefined) => {
      if (color !== undefined) void run(async () => { await setStatusColor(session, currentSpace, row.status, color) })
    })
  }

  function move (group: ProjectStatusGroup, from: number, to: number): void {
    const [row] = group.rows.splice(from, 1)
    group.rows.splice(to, 0, row)
    groups = groups
    const skipped = triage !== undefined && !group.isTriage && group.category === task.statusCategory.UnStarted ? 1 : 0
    void run(async () => { await moveStatus(session, currentSpace, row.status, to + skipped) })
  }

  function onDragOver (e: DragEvent & { currentTarget: HTMLElement }, group: ProjectStatusGroup, index: number): void {
    if (dragged?.category !== group.category) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    dropAt = { category: group.category, index, isAfter: e.clientY > rect.top + rect.height / 2 }
  }

  function onDrop (e: DragEvent, group: ProjectStatusGroup): void {
    e.preventDefault()
    if (dragged !== undefined && dropAt !== undefined) {
      const to = dropIndex(dragged.index, dropAt.index, dropAt.isAfter)
      if (to !== undefined) move(group, dragged.index, to)
    }
    dragged = undefined
    dropAt = undefined
  }

  function askDelete (group: ProjectStatusGroup, index: number): void {
    const targets = (groups ?? []).flatMap((it) => it.rows).filter((it) => it.status !== group.rows[index].status)
    deleting = { row: group.rows[index], targets, initial: group.rows[index === 0 ? 1 : index - 1].status }
  }
</script>

<div class="h-full min-h-0 overflow-y-auto" data-id="project-statuses">
  <div class="mx-auto grid w-full max-w-3xl gap-6 p-6">
    <div class="grid gap-1">
      <h2 class="m-0 text-lg font-semibold"><Label label={str.Statuses} /></h2>
      <p class="m-0 text-sm text-muted-foreground">
        {#if !canEdit}
          <Label label={str.StatusesReadOnly} />
        {:else}
          <Label label={isWorkflow ? str.WorkflowStatusesHint : str.StatusesHint} />
        {/if}
      </p>
    </div>

    <section class="flex items-center gap-3 rounded-lg border px-3 py-2.5" data-id="triage-settings">
      <div class="grid min-w-0 flex-1 gap-0.5">
        <span class="text-sm font-medium"><Label label={triageStr} /></span>
        <span class="text-xs text-muted-foreground"><Label label={isWorkflow ? str.WorkflowTriageIntakeHint : str.TriageIntakeHint} /></span>
      </div>
      {#if triage !== undefined}
        <button
          type="button"
          class="flex h-7 items-center gap-2 rounded-md px-2 text-sm enabled:hover:bg-muted"
          disabled={!canEdit}
          bind:this={triageOwnerButton}
          on:click={changeTriageOwner}
        >
          <span class="text-xs text-muted-foreground"><Label label={str.TriageOwner} /></span>
          <PersonRefPresenter value={triage.owner} disabled />
        </button>
      {:else}
        <span bind:this={triageOwnerButton}></span>
      {/if}
      <Switch bind:checked={isTriageOn} disabled={!canEdit} onCheckedChange={toggleTriage} aria-label={triageLabel} />
    </section>

    {#if groups !== undefined}
      <div class="grid gap-4">
        {#each groups as group (`${group.category}-${group.isTriage}`)}
          <section class="overflow-hidden rounded-lg border" data-id="status-group">
            <div class="flex h-9 items-center gap-2 bg-muted/50 pr-1.5 pl-3">
              <span class="text-sm font-medium"><Label label={groupLabel(group)} /></span>
              <span class="text-xs text-muted-foreground tabular-nums">{group.rows.length}</span>
              {#if canEdit && !group.isTriage}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  class="ml-auto"
                  onclick={() => { startAdd(group.category) }}
                >
                  <Plus />
                  <span class="sr-only"><Label label={str.AddStatus} /></span>
                </Button>
              {/if}
            </div>

            <div class="divide-y border-t">
              {#each group.rows as row, i (row.status)}
                {@const block = deleteBlock(group, row)}
                {@const isDropTarget = dropAt !== undefined && dropAt.category === group.category && dropAt.index === i}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="group/row relative flex h-9 items-center gap-2 pr-1.5 pl-7"
                  class:opacity-50={dragged !== undefined && dragged.category === group.category && dragged.index === i}
                  draggable={canEdit && renaming !== row.status}
                  on:dragstart={(e) => {
                    dragged = { category: group.category, index: i }
                    e.dataTransfer?.setData('text/plain', row.name)
                    if (e.dataTransfer !== null) e.dataTransfer.effectAllowed = 'move'
                  }}
                  on:dragend={() => {
                    dragged = undefined
                    dropAt = undefined
                  }}
                  on:dragover={(e) => { onDragOver(e, group, i) }}
                  on:drop={(e) => { onDrop(e, group) }}
                  bind:this={rowElements[row.status]}
                  data-id="status-row"
                >
                  {#if isDropTarget}
                    <div class="pointer-events-none absolute inset-x-0 h-0.5 bg-primary" class:top-0={!dropAt?.isAfter} class:bottom-0={dropAt?.isAfter}></div>
                  {/if}
                  {#if canEdit}
                    <GripVertical class="absolute left-2 size-3.5 cursor-grab text-muted-foreground opacity-0 group-hover/row:opacity-100" />
                  {/if}
                  <button
                    type="button"
                    class="flex size-5 shrink-0 items-center justify-center rounded-sm enabled:hover:bg-muted"
                    disabled={!canEdit}
                    on:click={(e) => { pickColor(e, row) }}
                  >
                    <IssueStatusIcon value={$statusStore.byId.get(row.status)} space={currentSpace} size="small" />
                    <span class="sr-only"><Label label={str.StatusColor} /></span>
                  </button>

                  {#if renaming === row.status}
                    <!-- Offset so the draft text sits where the name did. -->
                    <!-- svelte-ignore a11y_autofocus -->
                    <Input
                      class="-ml-1.5 h-7 flex-1 px-1.5"
                      bind:value={draft}
                      autofocus
                      onkeydown={(e) => { onDraftKey(e, () => { commitRename(row) }) }}
                      onblur={() => { commitRename(row) }}
                    />
                  {:else if canEdit}
                    <!-- Huly's global `button { justify-content: center }` would centre the name. -->
                    <button
                      type="button"
                      class="min-w-0 flex-1 justify-start text-sm"
                      on:click={() => { startRename(row) }}
                    >
                      <span class="truncate">{row.name}</span>
                    </button>
                  {:else}
                    <span class="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                  {/if}

                  {#if row.approval !== undefined}
                    <Badge variant="outline" class="max-w-48 text-muted-foreground" data-id="status-approval">
                      <ShieldCheck />
                      <Label label={str.ApprovalBadge} />
                      <span aria-hidden="true">·</span>
                      <span class="truncate text-foreground">
                        {#if row.approval.by === 'manager'}
                          <Label label={str.ApproverManager} />
                        {:else if row.approval.by === 'person'}
                          <PersonRefPresenter value={row.approval.person} shouldShowAvatar={false} disabled />
                        {:else}
                          {@const attribute = row.approval.attribute}
                          {@const field = personFields.find((it) => it.name === attribute)}
                          {#if field !== undefined}<Label label={field.label} />{:else}{attribute}{/if}
                        {/if}
                      </span>
                    </Badge>
                  {/if}
                  {#if row.isDefault}
                    <Badge variant="secondary"><Label label={str.DefaultStatus} /></Badge>
                  {/if}
                  <span class="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    <Label label={isWorkflow ? str.ItemCount : str.IssueCount} params={{ count: row.issueCount }} />
                  </span>

                  {#if canEdit}
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-xs' })}>
                        <Ellipsis />
                        <span class="sr-only"><Label label={str.StatusActions} /></span>
                      </DropdownMenu.Trigger>
                      <!-- Returning focus to the trigger would blur, and so close, the rename input just opened. -->
                      <DropdownMenu.Content
                        align="end"
                        class="w-52"
                        onCloseAutoFocus={(e) => { if (renaming !== undefined) e.preventDefault() }}
                      >
                        <DropdownMenu.Item onSelect={() => { startRename(row) }}>
                          <Label label={str.RenameStatus} />
                        </DropdownMenu.Item>
                        {#if !row.isDefault && DEFAULT_CATEGORIES.includes(group.category)}
                          <DropdownMenu.Item onSelect={() => { void run(async () => { await setDefaultStatus(session, currentSpace, row.status) }) }}>
                            <Label label={isWorkflow ? str.WorkflowSetDefaultStatus : str.SetDefaultStatus} />
                          </DropdownMenu.Item>
                        {/if}
                        <DropdownMenu.Item disabled={i === 0} onSelect={() => { move(group, i, i - 1) }}>
                          <Label label={str.MoveStatusUp} />
                        </DropdownMenu.Item>
                        <DropdownMenu.Item disabled={i === group.rows.length - 1} onSelect={() => { move(group, i, i + 1) }}>
                          <Label label={str.MoveStatusDown} />
                        </DropdownMenu.Item>
                        {#if !CLOSED_CATEGORIES.includes(group.category) && !group.isTriage}
                          <DropdownMenu.Separator />
                          <DropdownMenu.Label><Label label={str.RequireApproval} /></DropdownMenu.Label>
                          <DropdownMenu.Item onSelect={() => { approve(row, { by: 'manager' }) }}>
                            <Label label={str.ApproverManager} />
                            {#if row.approval?.by === 'manager'}<Check class="ml-auto" />{/if}
                          </DropdownMenu.Item>
                          {#each personFields as field (field.name)}
                            <DropdownMenu.Item onSelect={() => { approve(row, { by: 'field', attribute: field.name }) }}>
                              <Label label={field.label} />
                              {#if row.approval?.by === 'field' && row.approval.attribute === field.name}<Check class="ml-auto" />{/if}
                            </DropdownMenu.Item>
                          {/each}
                          <DropdownMenu.Item onSelect={() => { pickApprover(row) }}>
                            <Label label={str.ApproverPerson} />
                            {#if row.approval?.by === 'person'}<Check class="ml-auto" />{/if}
                          </DropdownMenu.Item>
                          {#if row.approval !== undefined}
                            <DropdownMenu.Item onSelect={() => { approve(row, undefined) }}>
                              <Label label={str.ApprovalOff} />
                            </DropdownMenu.Item>
                          {/if}
                        {/if}
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item variant="destructive" disabled={block !== undefined} onSelect={() => { askDelete(group, i) }}>
                          <div class="grid">
                            <Label label={str.DeleteStatus} />
                            {#if block !== undefined}
                              <span class="text-xs text-muted-foreground">
                                <Label label={block === 'default' ? str.DeleteDefaultBlocked : str.DeleteLastBlocked} />
                              </span>
                            {/if}
                          </div>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Root>
                  {/if}
                </div>
              {/each}

              {#if addingTo === group.category}
                <div class="flex h-9 items-center gap-2 pr-1.5 pl-7">
                  <span class="size-5 shrink-0"></span>
                  <!-- svelte-ignore a11y_autofocus -->
                  <Input
                    class="-ml-1.5 h-7 flex-1 px-1.5"
                    bind:value={draft}
                    placeholder={namePlaceholder}
                    autofocus
                    onkeydown={(e) => { onDraftKey(e, () => { commitAdd(group.category) }) }}
                    onblur={() => { commitAdd(group.category) }}
                  />
                </div>
              {/if}
            </div>
          </section>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if deleting !== undefined}
  <DeleteStatusDialog
    row={deleting.row}
    targets={deleting.targets}
    initial={deleting.initial}
    {isWorkflow}
    onDelete={(moveTo) => {
      const row = deleting?.row
      deleting = undefined
      if (row !== undefined) void run(async () => { await deleteStatus(session, currentSpace, row.status, moveTo) })
    }}
    onClose={() => { deleting = undefined }}
  />
{/if}
