<script lang="ts">
  import contact, { getCurrentEmployee, getName, type Employee } from '@hcengineering/contact'
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { Avatar } from '@hcengineering/contact-resources'
  import type { Department } from '@hcengineering/hr'
  import { translate, type IntlString } from '@hcengineering/platform'
  import { ComponentExtensions, createQuery, getClient } from '@hcengineering/presentation'
  import {
    Breadcrumbs,
    Header,
    Label,
    deviceOptionsStore as deviceInfo,
    popupstore,
    showPopup,
    themeStore,
    type AnyComponent
  } from '@hcengineering/ui'
  import { Ellipsis, Plus, Upload } from '@lucide/svelte'
  import EmptyState from '../../../components/EmptyState.svelte'
  import { emptyCopy, type EmptyAction } from '../../../onboarding/empty-copy'
  import { Button, buttonVariants } from '../../../lib/components/ui/button'
  import * as DropdownMenu from '../../../lib/components/ui/dropdown-menu'
  import { Input } from '../../../lib/components/ui/input'
  import { Skeleton } from '../../../lib/components/ui/skeleton'
  import { fold } from '../../../lib/fold'
  import { localDay } from '../../../lib/leave'
  import { teamDirectory, withoutBots } from '../../../lib/team-departments'
  import type { Leave } from '../../calendar-resources/lich/lib/leave'
  import hr from '../plugin'
  import { buildOrgChart, directoryGroups, formatLeaveDay, offOn, pathTo, reportingLines } from './chart'
  import ImportStaff from './import/ImportStaff.svelte'
  import { textOf } from './import/strings'
  import OrgPersonPanel from './OrgPersonPanel.svelte'
  import { str } from './plugin'

  export let createComponent: AnyComponent | undefined = undefined
  export let createLabel: IntlString | undefined = undefined

  const hierarchy = getClient().getHierarchy()
  const me = getCurrentEmployee()
  const canManage = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)

  let departments: Department[] | undefined
  let allEmployees: Employee[] = []
  let isEmployeesLoaded = false
  let leaves: Leave[] = []
  const directory = teamDirectory()
  createQuery().query(hr.class.Department, {}, (found) => (departments = found))
  createQuery().query(contact.mixin.Employee, { active: true }, (found) => {
    allEmployees = found
    isEmployeesLoaded = true
  })
  createQuery().query(hr.class.Request, {}, (found) => (leaves = found))

  const today = localDay(Date.now())
  const SKELETON_ROWS = Array.from({ length: 12 }, (_, index) => index)

  $: employees = withoutBots(allEmployees, $directory.bots)
  $: staff = employees.map((employee) => ({
    _id: employee._id,
    department: hierarchy.as(employee, hr.mixin.Staff).department
  }))
  $: people = new Map<string, Employee>(employees.map((employee) => [employee._id, employee]))
  $: names = new Map<string, string>(employees.map((employee) => [employee._id, getName(hierarchy, employee)]))
  $: titles = new Map<string, string>(
    employees.map((employee) => [employee._id, hierarchy.as(employee, contact.mixin.Employee).position ?? ''])
  )
  $: chart = departments === undefined ? undefined : buildOrgChart(departments, staff)
  $: managers = departments === undefined ? new Map<string, string | undefined>() : reportingLines(departments, staff)
  $: off = offOn(leaves, today, new Set(people.keys()))

  let query = ''
  let placeholder = ''
  $: void translate(str.FindEmployee, {}, $themeStore.language).then((label) => {
    placeholder = label
  })
  $: needle = fold(query.trim())
  const byName = (a: string, b: string): number => (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'vi')
  $: ledTeams = (departments ?? []).reduce((teams, dept) => {
    if (dept.teamLead !== null) teams.set(dept.teamLead, [...(teams.get(dept.teamLead) ?? []), dept.name])
    return teams
  }, new Map<string, string[]>())
  $: groups = (() => {
    const listed = new Set<string>()
    return (chart === undefined ? [] : directoryGroups(chart))
      .map(({ department, people: ids }) => {
        const [head, ...rest] = ids
        const isHeaded = department.teamLead === head
        const ordered = (isHeaded ? [head, ...[...rest].sort(byName)] : [...ids].sort(byName)).filter((id) => !listed.has(id))
        ordered.forEach((id) => listed.add(id))
        if (needle === '' || fold(department.name).includes(needle)) return { department, ids: ordered }
        return {
          department,
          ids: ordered.filter((id) => fold(`${names.get(id) ?? ''} ${titles.get(id) ?? ''}`).includes(needle))
        }
      })
      .filter((group) => group.ids.length > 0)
  })()

  let selected: string | undefined
  $: person = selected === undefined ? undefined : people.get(selected)
  $: path = chart === undefined || selected === undefined ? [] : pathTo(chart, selected)
  $: team = departments?.find((dept) => dept._id === path[path.length - 1])
  $: managerId = selected === undefined ? undefined : managers.get(selected)
  $: manager = managerId === undefined ? undefined : people.get(managerId)
  $: reports = employees
    .filter((employee) => managers.get(employee._id) === selected)
    .sort((a, b) => byName(a._id, b._id))

  let isImportOpen = false
  const addTeamActions: EmptyAction[] = [
    { label: emptyCopy.peopleInvite, run: () => showPopup('login:component:InviteLink' as AnyComponent, {}) },
    { label: emptyCopy.peopleImport, run: () => { isImportOpen = true } }
  ]
  $: importText = textOf($themeStore.language)

  function onWindowKey (event: KeyboardEvent): void {
    if (event.key === 'Escape' && !isImportOpen && $popupstore.length === 0 && selected !== undefined) selected = undefined
  }
</script>

<svelte:window on:keydown={onWindowKey} />

{#if $deviceInfo.isMobile}
  {#if person === undefined}
    <div class="flex shrink-0 items-center gap-2 border-b bg-background px-3 py-2">
      <Input type="search" bind:value={query} {placeholder} aria-label={placeholder} class="h-10 min-w-0 flex-1 text-sm" />
      {#if canManage && createComponent !== undefined && createLabel !== undefined}
        {@const create = createComponent}
        <Button size="icon" class="size-10 shrink-0" onclick={() => showPopup(create, {}, 'top')}>
          <Plus class="size-5" />
          <span class="sr-only"><Label label={createLabel} /></span>
        </Button>
      {/if}
      {#if canManage}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' }) + ' size-10 shrink-0'}>
            <Ellipsis class="size-5" />
            <span class="sr-only"><Label label={str.MoreActions} /></span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-56">
            <DropdownMenu.Item disabled={departments === undefined} onSelect={() => { isImportOpen = true }}>
              <Upload class="size-4" />
              {importText('ImportCsv')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
    </div>
  {/if}
{:else}
<Header adaptive={'disabled'} singleRow hideActions={!canManage}>
  <Breadcrumbs items={[{ icon: contact.icon.Person, label: contact.string.Employees }]} />
  <svelte:fragment slot="search">
    <Input type="search" bind:value={query} {placeholder} aria-label={placeholder} class="h-7 w-72 text-[13px] max-sm:w-40" />
  </svelte:fragment>
  <svelte:fragment slot="actions">
    {#if canManage}
      <Button size="sm" variant="outline" disabled={departments === undefined} onclick={() => { isImportOpen = true }}>
        <Upload class="size-4" />
        {importText('ImportCsv')}
      </Button>
    {/if}
    {#if canManage && createComponent !== undefined && createLabel !== undefined}
      {@const create = createComponent}
      <Button size="sm" onclick={() => showPopup(create, {}, 'top')}>
        <Plus class="size-4" />
        <Label label={createLabel} />
      </Button>
    {/if}
  </svelte:fragment>
</Header>
{/if}

{#if isImportOpen && departments !== undefined}
  <ImportStaff {departments} {employees} onClose={() => { isImportOpen = false }} />
{/if}

{#if departments === undefined || chart === undefined || !isEmployeesLoaded}
  <div class="min-h-0 flex-1 overflow-hidden" aria-busy="true">
    <Skeleton class="h-9 w-full rounded-none" />
    {#each SKELETON_ROWS as row (row)}
      <div class="flex h-11 items-center gap-2.5 border-b px-6">
        <Skeleton class="size-6 rounded-full" />
        <Skeleton class="h-3.5 w-40" />
        <Skeleton class="ml-[12%] h-3.5 w-28" />
      </div>
    {/each}
  </div>
{:else}
  <div class="relative flex min-h-0 flex-1">
    <div class="min-h-0 min-w-0 flex-1 overflow-auto">
      {#if groups.length === 0}
        <p class="px-6 py-5 text-sm text-muted-foreground"><Label label={str.NoMatches} /></p>
      {/if}
      {#each groups as group (group.department._id)}
        <section aria-labelledby="dir-{group.department._id}">
          <h2
            id="dir-{group.department._id}"
            class="sticky top-0 z-[1] m-0 flex h-9 items-center gap-2 border-b bg-background px-6 text-[13px] font-medium"
          >
            {group.department.name}
            <span class="font-normal tabular-nums text-muted-foreground">{group.ids.length}</span>
          </h2>
          <ul class="m-0 p-0">
            {#each group.ids as id (id)}
              {@const employee = people.get(id)}
              {@const managerName = names.get(managers.get(id) ?? '')}
              {@const until = off.get(id)}
              {@const led = ledTeams.get(id) ?? []}
              {#if employee !== undefined}
                <li class="row" class:is-selected={selected === id}>
                  <button type="button" class="open" on:click={() => { selected = id }}>
                    <span class="flex min-w-0 items-center gap-2.5">
                      <Avatar person={employee} name={employee.name} size={'small'} variant={'circle'} showStatus />
                      <span class="truncate font-medium">{names.get(id)}</span>
                      {#if led.length > 0}
                        <span class="shrink-0 text-xs text-muted-foreground"><Label label={str.Lead} /></span>
                      {/if}
                      {#if until !== undefined}
                        <span class="off">
                          <Label label={str.OffUntil} params={{ date: formatLeaveDay(until, $themeStore.language) }} />
                        </span>
                      {/if}
                    </span>
                    <span class="truncate text-muted-foreground">
                      {#if (titles.get(id) ?? '') !== ''}
                        {titles.get(id)}
                      {:else if led.length > 0}
                        <Label label={str.LeadsDepartment} params={{ department: led.join(', ') }} />
                      {/if}
                    </span>
                    <span class="truncate text-muted-foreground">
                      {#if managerName !== undefined}
                        <Label label={str.ReportsTo} />: <span class="text-foreground">{managerName}</span>
                      {/if}
                    </span>
                  </button>
                  <div class="actions">
                    {#if id !== me}
                      <ComponentExtensions
                        extension={contact.extension.EmployeePopupActions}
                        props={{ employee, type: 'type-button-icon', kind: 'tertiary' }}
                      />
                    {/if}
                  </div>
                </li>
              {/if}
            {/each}
          </ul>
        </section>
      {/each}
      {#if canManage && employees.length <= 1 && needle === ''}
        <EmptyState title={emptyCopy.people} actions={addTeamActions} />
      {/if}
    </div>
    {#if person !== undefined}
      {#key person._id}
        <OrgPersonPanel
          {person}
          {team}
          {manager}
          {reports}
          canMove={canManage}
          {departments}
          {chart}
          {staff}
          {names}
          offUntil={off.get(person._id)}
          {today}
          onSelect={(id) => { selected = id }}
          onClose={() => { selected = undefined }}
        />
      {/key}
    {/if}
  </div>
{/if}

<style>
  .row {
    display: flex;
    height: 2.75rem;
    align-items: center;
    gap: 0.5rem;
    padding-right: 1.5rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.875rem;
    list-style: none;
  }
  .row:hover,
  .row.is-selected {
    background: var(--accent);
  }
  .open {
    display: grid;
    flex: 1;
    min-width: 0;
    height: 100%;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1.5fr);
    align-items: center;
    gap: 1rem;
    padding-left: 1.5rem;
    text-align: left;
  }
  .open:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  .actions {
    display: flex;
    min-width: 4rem;
    justify-content: flex-end;
    gap: 0.25rem;
  }
  .off {
    flex-shrink: 0;
    padding: 0 0.375rem;
    border-radius: 9999px;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }
  :global(#ui-root.mobile-theme) .row {
    height: auto;
    min-height: 3.25rem;
    padding-right: 0.5rem;
  }
  :global(#ui-root.mobile-theme) .open {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.125rem;
    padding: 0.5rem 0 0.5rem 1rem;
  }
  :global(#ui-root.mobile-theme) .open > :nth-child(2) {
    padding-left: 2.625rem;
    font-size: 0.8125rem;
  }
  :global(#ui-root.mobile-theme) .open > :nth-child(3) {
    display: none;
  }
  :global(#ui-root.mobile-theme) .actions {
    min-width: 0;
  }
</style>
