<script lang="ts">
  import contact, { getFirstName, getLastName, getName, type Employee } from '@hcengineering/contact'
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { Avatar, PersonPresenter } from '@hcengineering/contact-resources'
  import type { Department } from '@hcengineering/hr'
  import { translate } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Breadcrumbs, Header, Label, Loading, deviceOptionsStore as deviceInfo, popupstore, themeStore, tooltip } from '@hcengineering/ui'
  import { tick } from 'svelte'
  import { Input } from '../../../lib/components/ui/input'
  import { fold } from '../../../lib/fold'
  import { localDay } from '../../../lib/leave'
  import { teamDirectory, withoutBots } from '../../../lib/team-departments'
  import { shortNames, type Leave } from '../../calendar-resources/lich/lib/leave'
  import hr from '../plugin'
  import { buildOrgChart, formatLeaveDay, offOn, pathTo, reportingLines } from './chart'
  import OrgChartNode from './OrgChartNode.svelte'
  import OrgDepartmentList from './OrgDepartmentList.svelte'
  import OrgPersonPanel from './OrgPersonPanel.svelte'
  import { str } from './plugin'

  const MAX_MATCHES = 8
  const MAX_OFF_NAMES = 3

  const hierarchy = getClient().getHierarchy()
  const canMove = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)

  let departments: Department[] | undefined
  let allEmployees: Employee[] = []
  const directory = teamDirectory()
  const departmentQuery = createQuery()
  const employeeQuery = createQuery()
  departmentQuery.query(hr.class.Department, {}, (found) => (departments = found))
  let isEmployeesLoaded = false
  employeeQuery.query(contact.mixin.Employee, { active: true }, (found) => {
    allEmployees = found
    isEmployeesLoaded = true
  })
  let leaves: Leave[] | undefined
  const leaveQuery = createQuery()
  leaveQuery.query(hr.class.Request, {}, (found) => (leaves = found))

  const today = localDay(Date.now())

  $: employees = withoutBots(allEmployees, $directory.bots)
  $: staff = employees.map((employee) => ({
    _id: employee._id,
    department: hierarchy.as(employee, hr.mixin.Staff).department
  }))
  $: people = new Map<string, Employee>(employees.map((employee) => [employee._id, employee]))
  $: names = new Map<string, string>(employees.map((employee) => [employee._id, getName(hierarchy, employee)]))
  $: chart = departments === undefined ? undefined : buildOrgChart(departments, staff)
  $: off = offOn(leaves ?? [], today, new Set(people.keys()))
  $: offPeople = [...off.keys()]
    .map((id) => people.get(id))
    .filter((employee): employee is Employee => employee !== undefined)
    .sort((a, b) => (names.get(a._id) ?? '').localeCompare(names.get(b._id) ?? '', 'vi'))
  let isOffExpanded = false
  $: shownOff = isOffExpanded ? offPeople : offPeople.slice(0, MAX_OFF_NAMES)
  $: offNames = shortNames(offPeople.map((absent) => ({ first: getFirstName(absent.name), last: getLastName(absent.name) })))
  $: managers = departments === undefined ? new Map<string, string | undefined>() : reportingLines(departments, staff)

  let selected: string | undefined
  $: person = selected === undefined ? undefined : people.get(selected)
  $: path = chart === undefined || selected === undefined ? [] : pathTo(chart, selected)
  $: team = departments?.find((dept) => dept._id === path[path.length - 1])
  $: managerId = selected === undefined ? undefined : managers.get(selected)
  $: manager = managerId === undefined ? undefined : people.get(managerId)
  $: reports = employees
    .filter((employee) => managers.get(employee._id) === selected)
    .sort((a, b) => (names.get(a._id) ?? '').localeCompare(names.get(b._id) ?? '', 'vi'))

  let query = ''
  let placeholder = ''
  $: void translate(str.FindPerson, {}, $themeStore.language).then((label) => {
    placeholder = label
  })
  $: needle = fold(query.trim())
  $: matches =
    needle === ''
      ? []
      : employees.filter((employee) => fold(names.get(employee._id) ?? '').includes(needle)).slice(0, MAX_MATCHES)
  let isListOpen = false
  let activeIndex = 0
  $: activeMatch = activeIndex < matches.length ? matches[activeIndex] : undefined

  async function select (id: string): Promise<void> {
    selected = id
    query = ''
    isListOpen = false
    await tick()
    const target = path[path.length - 1]
    if (target === undefined) return
    document.querySelector(`[data-dept="${target}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }

  function onSearchKey (event: KeyboardEvent): void {
    isListOpen = true
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      if (matches.length > 0) activeIndex = (activeIndex + step + matches.length) % matches.length
    }
    if (event.key === 'Enter' && activeMatch !== undefined) void select(activeMatch._id)
    if (event.key === 'Escape' && query !== '') {
      event.stopPropagation()
      query = ''
      isListOpen = false
    }
  }

  function onWindowKey (event: KeyboardEvent): void {
    if (event.key === 'Escape' && query === '' && $popupstore.length === 0 && selected !== undefined) selected = undefined
  }
</script>

<svelte:window on:keydown={onWindowKey} />

<Header adaptive={'disabled'} singleRow>
  <Breadcrumbs items={[{ icon: hr.icon.Structure, label: str.OrgChart }]} />
  <svelte:fragment slot="search">
    <div class="relative w-60 max-sm:w-40">
      <Input
        bind:value={query}
        {placeholder}
        class="h-7 text-[13px]"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="org-person-results"
        aria-expanded={isListOpen && needle !== ''}
        aria-activedescendant={isListOpen && activeMatch !== undefined ? `org-person-${activeMatch._id}` : undefined}
        onkeydown={onSearchKey}
        oninput={() => {
          isListOpen = true
          activeIndex = 0
        }}
        onfocus={() => { isListOpen = true }}
        onblur={() => { isListOpen = false }}
      />
      {#if isListOpen && needle !== ''}
        <div class="absolute right-0 top-full z-10 mt-1 grid w-full gap-px rounded-lg border bg-popover p-1 shadow-md">
          {#if matches.length === 0}
            <span class="px-2 py-1.5 text-xs text-muted-foreground"><Label label={str.NoMatches} /></span>
          {/if}
          <div id="org-person-results" role="listbox" class="grid gap-px">
            {#each matches as match, index (match._id)}
              <!-- Focus stays in the input (aria-activedescendant); mousedown would blur it and close the list before the click lands. -->
              <button
                type="button"
                id="org-person-{match._id}"
                role="option"
                tabindex="-1"
                aria-selected={index === activeIndex}
                class="match"
                class:is-active={index === activeIndex}
                on:mousedown|preventDefault
                on:mouseenter={() => { activeIndex = index }}
                on:click={() => { void select(match._id) }}
              >
                <PersonPresenter value={match} avatarSize={'x-small'} disabled />
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </svelte:fragment>
</Header>

{#if departments === undefined}
  <Loading />
{:else if chart === undefined}
  <p class="px-6 py-5 text-sm text-muted-foreground"><Label label={str.NoDepartments} /></p>
{:else}
  <div class="relative flex min-h-0 flex-1">
    <div class="min-h-0 min-w-0 flex-1 overflow-auto">
      <div class="sticky left-0 flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-6 pt-3 text-[13px] text-muted-foreground">
        {#if leaves === undefined || !isEmployeesLoaded}
          <!-- Keeps the line's height so the chart doesn't jump when leave loads. -->
        {:else if offPeople.length === 0}
          <Label label={str.NobodyOff} />
        {:else}
          <span class="font-medium"><Label label={str.OffToday} params={{ count: offPeople.length }} /></span>
          <ul class="m-0 flex flex-wrap items-center gap-1 p-0">
            {#each shownOff as absent, index (absent._id)}
              {@const until = off.get(absent._id)}
              {@const name = names.get(absent._id) ?? ''}
              <li class="list-none">
                <button
                  type="button"
                  class="absent"
                  class:is-selected={selected === absent._id}
                  aria-label={name}
                  use:tooltip={{
                    label: str.OffTooltip,
                    props: { name, date: until === undefined ? '' : formatLeaveDay(until, $themeStore.language) }
                  }}
                  on:click={() => { void select(absent._id) }}
                >
                  <Avatar person={absent} name={absent.name} size={'x-small'} variant={'circle'} />
                  <span class="truncate">{offNames[index]}</span>
                </button>
              </li>
            {/each}
            {#if offPeople.length > MAX_OFF_NAMES}
              <li class="list-none">
                <button type="button" class="absent is-more" on:click={() => { isOffExpanded = !isOffExpanded }}>
                  {#if isOffExpanded}
                    <Label label={str.ShowLess} />
                  {:else}
                    <Label label={str.MoreMembers} params={{ count: offPeople.length - MAX_OFF_NAMES }} />
                  {/if}
                </button>
              </li>
            {/if}
          </ul>
        {/if}
      </div>
      {#if $deviceInfo.isMobile}
        <OrgDepartmentList node={chart} {people} {names} {off} {selected} onSelect={(id) => { void select(id) }} />
      {:else}
        <div class="flex min-w-max justify-center px-6 py-5">
          <OrgChartNode node={chart} {people} {names} {off} {selected} {path} onSelect={(id) => { void select(id) }} />
        </div>
      {/if}
    </div>
    {#if person !== undefined}
      {#key person._id}
        <OrgPersonPanel
          {person}
          {team}
          {manager}
          {reports}
          {canMove}
          {departments}
          {chart}
          {staff}
          {names}
          offUntil={off.get(person._id)}
          {today}
          onSelect={(id) => { void select(id) }}
          onClose={() => { selected = undefined }}
        />
      {/key}
    {/if}
  </div>
{/if}

<style>
  .match {
    display: flex;
    justify-content: flex-start;
    height: 1.75rem;
    align-items: center;
    padding: 0 0.5rem;
    border-radius: 0.375rem;
    text-align: left;
  }
  .absent {
    display: flex;
    justify-content: flex-start;
    max-width: 10rem;
    height: 1.5rem;
    align-items: center;
    gap: 0.375rem;
    padding: 0 0.5rem 0 2px;
    border-radius: 9999px;
    color: var(--muted-foreground);
  }
  .absent.is-more {
    padding: 0 0.5rem;
  }
  .absent:hover {
    color: var(--foreground);
    background: var(--accent);
  }
  .absent.is-selected {
    box-shadow: 0 0 0 2px var(--ring);
  }
  .absent:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }
  .match:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
  .match.is-active {
    background: var(--accent);
  }
</style>
