<script lang="ts">
  import contact, { getName, type Employee } from '@hcengineering/contact'
  import { Avatar, PersonPresenter } from '@hcengineering/contact-resources'
  import { SocialIdType, type Ref } from '@hcengineering/core'
  import type { Department } from '@hcengineering/hr'
  import { ComponentExtensions, createQuery, getClient } from '@hcengineering/presentation'
  import { Label, SelectPopup, deviceOptionsStore as deviceInfo, eventToHTMLElement, showPopup, themeStore } from '@hcengineering/ui'
  import { openDoc } from '@hcengineering/view-resources'
  import { ArrowLeft, ArrowUpRight, ChevronsUpDown, Mail, TriangleAlert, X } from '@lucide/svelte'
  import { onDestroy } from 'svelte'
  import { Button } from '../../../lib/components/ui/button'
  import type { LeaveDay } from '../../../lib/leave'
  import StartJobActions from '../../tracker-resources/workflows/onboarding/StartJobActions.svelte'
  import hr from '../plugin'
  import { departmentTree, formatLeaveDay, loopAfterMove, type ChartNode, type ChartStaff } from './chart'
  import { str } from './plugin'

  export let person: Employee
  export let team: Department | undefined
  export let manager: Employee | undefined
  export let reports: Employee[]
  export let onSelect: (person: string) => void
  export let onClose: () => void
  export let canMove: boolean
  export let departments: Department[]
  export let chart: ChartNode<Department>
  export let staff: ChartStaff[]
  export let names: Map<string, string>
  export let offUntil: LeaveDay | undefined
  export let today: LeaveDay

  const UNDO_MS = 8000
  const INDENT = '\u2003'

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let email: string | undefined
  createQuery().query(
    contact.class.SocialIdentity,
    { attachedTo: person._id, type: SocialIdType.EMAIL },
    (found) => {
      email = found[0]?.value
    }
  )

  let held: { department: Ref<Department>, chain: string } | undefined
  let isSaving = false
  let moved: { from: Ref<Department>, to: string } | undefined
  let moveError: string | undefined
  let undoTimer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => {
    clearTimeout(undoTimer)
  })

  $: filedId = hierarchy.as(person, hr.mixin.Staff).department ?? hr.ids.Head
  $: filed = departments.find((dept) => dept._id === filedId)
  $: isLastDayOff = offUntil !== undefined && offUntil.year === today.year && offUntil.month === today.month && offUntil.day === today.day
  $: offDate = offUntil === undefined ? '' : formatLeaveDay(offUntil, $themeStore.language)
  $: leads = team !== undefined && team.teamLead === person._id ? team : undefined
  $: isLeadFiled = leads?._id === filedId

  function pickDepartment (event: MouseEvent): void {
    const options = departmentTree(chart)
      .map(({ department, depth }) => ({
        id: department._id,
        text: department._id === filedId ? department.name : INDENT.repeat(depth) + department.name,
        isSelected: department._id === filedId
      }))
      .sort((a, b) => Number(b.isSelected) - Number(a.isSelected))
    showPopup(
      SelectPopup,
      {
        searchable: true,
        placeholder: str.MoveTo,
        value: options
      },
      eventToHTMLElement(event),
      (picked: Ref<Department> | undefined) => {
        if (picked === undefined || picked === filedId) return
        const loop = loopAfterMove(departments, staff, person._id, picked)
        if (loop.length === 0) {
          void move(picked)
          return
        }
        held = { department: picked, chain: loop.map((id) => names.get(id) ?? '').join(' → ') }
      }
    )
  }

  async function save (department: Ref<Department>): Promise<boolean> {
    isSaving = true
    moveError = undefined
    try {
      await client.updateMixin(person._id, person._class, person.space, hr.mixin.Staff, { department })
      return true
    } catch (error) {
      moveError = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      isSaving = false
      held = undefined
    }
  }

  async function move (department: Ref<Department>): Promise<void> {
    const from = filedId
    clearTimeout(undoTimer)
    moved = undefined
    if (!(await save(department))) return
    moved = { from, to: departments.find((dept) => dept._id === department)?.name ?? '' }
    undoTimer = setTimeout(() => {
      moved = undefined
    }, UNDO_MS)
  }

  async function undo (from: Ref<Department>): Promise<void> {
    clearTimeout(undoTimer)
    moved = undefined
    await save(from)
  }
</script>

<aside class="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l bg-background px-5 py-4 text-[13px]">
  {#if $deviceInfo.isMobile}
    <Button variant="ghost" class="-ml-2 h-10 self-start px-2 text-sm" onclick={onClose}>
      <ArrowLeft class="size-5" />
      <Label label={str.Back} />
    </Button>
  {/if}
  <div class="flex items-start gap-3">
    <Avatar person={person} name={person.name} size={'large'} />
    <div class="grid min-w-0 flex-1 gap-0.5 pt-1">
      <span class="truncate text-[15px] font-semibold">{getName(hierarchy, person)}</span>
      {#if person.position}
        <span class="truncate text-xs text-muted-foreground">{person.position}</span>
      {/if}
      {#if offUntil !== undefined}
        <span class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span class="size-1.5 shrink-0 rounded-full border border-muted-foreground" aria-hidden="true" />
          {#if isLastDayOff}
            <Label label={str.OffJustToday} />
          {:else}
            <Label label={str.OffUntil} params={{ date: offDate }} />
          {/if}
        </span>
      {/if}
    </div>
    {#if !$deviceInfo.isMobile}
      <Button size="icon-sm" variant="ghost" onclick={onClose}>
        <X />
        <span class="sr-only"><Label label={str.Close} /></span>
      </Button>
    {/if}
  </div>

  {#if $deviceInfo.isMobile}
    <div class="contact-actions flex gap-2">
      <ComponentExtensions
        extension={contact.extension.EmployeePopupActions}
        props={{ employee: person, type: 'type-button', kind: 'secondary' }}
      />
      {#if email !== undefined}
        <Button variant="outline" class="h-10 flex-1" href={`mailto:${email}`}>
          <Mail class="size-4" />
          <Label label={str.Email} />
        </Button>
      {/if}
    </div>
  {/if}

  <dl class="m-0 grid gap-4">
    <div class="grid gap-1">
      <dt class="text-xs font-medium text-muted-foreground"><Label label={str.Department} /></dt>
      <dd class="m-0">
        {#if leads !== undefined}
          <button type="button" class="row gap-1.5 font-medium" on:click={() => openDoc(hierarchy, leads)}>
            <span class="truncate"><Label label={str.LeadsDepartment} params={{ department: leads.name }} /></span>
            <ArrowUpRight class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        {/if}
        {#if canMove}
          <button
            type="button"
            class="row gap-1.5 {leads === undefined ? 'font-medium' : 'text-xs text-muted-foreground'}"
            aria-haspopup="listbox"
            disabled={isSaving}
            on:click={pickDepartment}
          >
            {#if leads !== undefined}
              <span class="shrink-0"><Label label={str.InDepartment} /></span>
            {/if}
            {#if filed !== undefined}
              <span class="truncate text-foreground">{filed.name}</span>
            {:else}
              <span class="font-normal text-muted-foreground"><Label label={str.NoDepartment} /></span>
            {/if}
            <ChevronsUpDown class="ml-auto size-3.5 shrink-0 text-muted-foreground" />
          </button>
          {#if leads !== undefined && !isLeadFiled}
            <p class="m-0 mt-1 text-xs text-muted-foreground"><Label label={str.LeadSitsAbove} /></p>
          {/if}
          {#if moveError !== undefined}
            <p class="m-0 mt-1.5 flex gap-1.5 text-xs text-destructive" role="alert">
              <TriangleAlert class="mt-px size-3.5 shrink-0" />
              <span><Label label={str.MoveFailed} params={{ reason: moveError }} /></span>
            </p>
          {/if}
          {#if moved !== undefined}
            {@const from = moved.from}
            <div class="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <span class="min-w-0 truncate"><Label label={str.MovedTo} params={{ department: moved.to }} /></span>
              <Button size="xs" variant="ghost" class="ml-auto" disabled={isSaving} onclick={() => { void undo(from) }}>
                <Label label={str.Undo} />
              </Button>
            </div>
          {/if}
          {#if held !== undefined}
            {@const target = held.department}
            <div class="mt-1.5 grid gap-2" role="alert">
              <p class="m-0 flex gap-1.5 text-xs text-destructive">
                <TriangleAlert class="mt-px size-3.5 shrink-0" />
                <span><Label label={str.ReportingLoop} params={{ chain: held.chain }} /></span>
              </p>
              <div class="flex gap-1.5">
                <Button size="xs" variant="destructive" disabled={isSaving} onclick={() => { void move(target) }}>
                  <Label label={str.MoveAnyway} />
                </Button>
                <Button size="xs" variant="ghost" disabled={isSaving} onclick={() => { held = undefined }}>
                  <Label label={str.Cancel} />
                </Button>
              </div>
            </div>
          {/if}
        {:else if leads !== undefined}
          {#if !isLeadFiled}
            <p class="m-0 flex gap-1.5 text-xs text-muted-foreground">
              <Label label={str.InDepartment} />
              {#if filed !== undefined}
                <span class="truncate text-foreground">{filed.name}</span>
              {:else}
                <Label label={str.NoDepartment} />
              {/if}
            </p>
          {/if}
        {:else if team !== undefined}
          <button type="button" class="row gap-1.5 font-medium" on:click={() => openDoc(hierarchy, team)}>
            <span class="truncate">{team.name}</span>
            <ArrowUpRight class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        {/if}
      </dd>
    </div>
    <div class="grid gap-1">
      <dt class="text-xs font-medium text-muted-foreground"><Label label={str.ReportsTo} /></dt>
      <dd class="m-0">
        {#if manager !== undefined}
          <button type="button" class="row" on:click={() => { onSelect(manager._id) }}>
            <PersonPresenter value={manager} avatarSize={'x-small'} disabled />
          </button>
        {:else}
          <span class="text-muted-foreground"><Label label={str.NoManager} /></span>
        {/if}
      </dd>
    </div>
    <div class="grid gap-1">
      <dt class="text-xs font-medium text-muted-foreground">
        <Label label={str.DirectReports} />
        {#if reports.length > 0}<span class="ml-1 tabular-nums">{reports.length}</span>{/if}
      </dt>
      <dd class="m-0 grid gap-px">
        {#each reports as report (report._id)}
          <button type="button" class="row" on:click={() => { onSelect(report._id) }}>
            <PersonPresenter value={report} avatarSize={'x-small'} disabled />
          </button>
        {:else}
          <span class="text-muted-foreground"><Label label={str.NoDirectReports} /></span>
        {/each}
      </dd>
    </div>
  </dl>

  <Button variant="outline" size="sm" class="self-start" onclick={() => openDoc(hierarchy, person)}>
    <Label label={str.OpenProfile} />
  </Button>
  <StartJobActions {person} class="border-t pt-4" />
</aside>

<style>
  .row {
    display: flex;
    justify-content: flex-start;
    width: calc(100% + 0.75rem);
    min-width: 0;
    height: 1.75rem;
    align-items: center;
    margin: 0 -0.375rem;
    padding: 0 0.375rem;
    border-radius: 0.375rem;
    text-align: left;
  }
  .row:hover:not(:disabled) {
    background: var(--accent);
  }
  .row:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  .row:disabled {
    opacity: 0.5;
  }
  :global(#ui-root.mobile-theme) aside {
    position: absolute;
    inset: 0;
    z-index: 2;
    width: auto;
    border-left: 0;
  }
  .contact-actions :global(.button-container) {
    flex: 1;
  }
  .contact-actions :global(.button-container button) {
    width: 100%;
    min-height: 2.5rem;
    border-radius: 0.5rem;
  }
  :global(#ui-root.mobile-theme) .row {
    height: 2.75rem;
  }
</style>
