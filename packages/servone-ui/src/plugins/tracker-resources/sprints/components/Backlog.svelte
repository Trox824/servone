<script lang="ts">
  import { blockedIds, pickBlockers } from '../blocked'
  import type { Person } from '@hcengineering/contact'
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { AssigneePopup } from '@hcengineering/contact-resources'
  import type { Ref } from '@hcengineering/core'
  import { getEmbeddedLabel, translate, type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import tracker, { type Issue, type Milestone, type Project } from '@hcengineering/tracker'
  import {
    Breadcrumbs,
    Button,
    deviceOptionsStore as deviceInfo,
    Header,
    IconAdd,
    IconClose,
    IconCollapseArrow,
    IconMoreH,
    Label,
    Loading,
    Scroller,
    SelectPopup,
    showPopup,
    themeStore,
    tooltip,
    type PopupAlignment,
    type SelectPopupValueType
  } from '@hcengineering/ui'
  import { issuePriorities } from '../../types'
  import { cancelStart, createSprint, deleteSprint, moveIssues, projectStatuses, ranksBetween, setEpic, toPlanIssue, updateIssues } from '../data'
  import { focusHeaderSearch, isFiltered, matchesFilter, NO_FILTER, type IssueFilter } from '../filters'
  import { clickControl, elementOf, scrollToIssue, shouldIgnore, step } from '../keyboard'
  import { canAddToSprint, nextSprintDefaults } from '../lib/lifecycle'
  import { isBacklogRow, totals } from '../lib/totals'
  import { capacity, statusSplit } from '../lib/capacity'
  import { isOpen, type Sprint } from '../lib/types'
  import { icon, str } from '../plugin'
  import { ISSUE_POINTS, projectSettings, toSprint } from '../schema'
  import { isEpic, isScrumProject } from '../setup'
  import { byRank, DRAG_TYPE, fmtRange } from '../ui'
  import CompleteSprintDialog from './CompleteSprintDialog.svelte'
  import EpicFilter from './EpicFilter.svelte'
  import Filters from './Filters.svelte'
  import HeaderSearch from './HeaderSearch.svelte'
  import IssueRow from './IssueRow.svelte'
  import PointsPicker from './PointsPicker.svelte'
  import QuickCreateRow from './QuickCreateRow.svelte'
  import QuickModes from './QuickModes.svelte'
  import SetupPanel from './SetupPanel.svelte'
  import ShortcutsHelp from './ShortcutsHelp.svelte'
  import SprintSettingsDialog from './SprintSettingsDialog.svelte'
  import StartSprintDialog from './StartSprintDialog.svelte'
  import TotalsBadge from './TotalsBadge.svelte'
  import CycleProgress from './CycleProgress.svelte'
  import EditSprintDialog from './EditSprintDialog.svelte'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const me = getCurrentEmployee()

  let sprintOptionsLabel = ''
  $: void translate(str.SprintOptions, {}, $themeStore.language).then((v) => (sprintOptionsLabel = v))

  let project: Project | undefined
  let issues: Issue[] = []
  let milestones: Milestone[] = []
  let loaded = false

  const projectQuery = createQuery()
  const issueQuery = createQuery()
  const milestoneQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (res) => (project = res[0]))
  $: issueQuery.query(tracker.class.Issue, { space: currentSpace }, (res) => {
    issues = res
    loaded = true
    settle(res)
  })
  $: milestoneQuery.query(tracker.class.Milestone, { space: currentSpace }, (res) => (milestones = res))

  let pending = new Map<string, Record<string, unknown>>()
  function settle (docs: Issue[]): void {
    if (pending.size === 0) return
    for (const doc of docs) {
      const patch = pending.get(doc._id)
      if (patch !== undefined && Object.entries(patch).every(([k, v]) => ((doc as any)[k] ?? null) === (v ?? null))) {
        pending.delete(doc._id)
      }
    }
    pending = pending
  }
  async function optimistic (patches: Array<[Issue, Record<string, unknown>]>, run: () => Promise<void>): Promise<void> {
    for (const [it, patch] of patches) pending.set(it._id, { ...pending.get(it._id), ...patch })
    pending = pending
    const drop = (): void => {
      for (const [it] of patches) pending.delete(it._id)
      pending = pending
    }
    try {
      await run()
      setTimeout(drop, 4000)
    } catch (err) {
      drop()
      throw err
    }
  }
  $: shown = pending.size === 0 ? issues : issues.map((it) => (pending.has(it._id) ? ({ ...it, ...pending.get(it._id) } as Issue) : it))

  let filter: IssueFilter = { ...NO_FILTER }

  $: settings = projectSettings(project)
  $: scrum = project !== undefined && isScrumProject(project)
  $: epics = shown.filter(isEpic).sort(byRank)
  $: epicIds = new Set<string>(epics.map((e) => e._id))
  $: epicById = new Map(epics.map((e) => [e._id as string, e]))
  $: sprints = milestones.map((m) => ({ doc: m, sprint: toSprint(m) }))
  $: byPoints = settings.scale !== 'off'
  $: teamCapacity = capacity(sprints.map((s) => s.sprint), byPoints)
  $: sections = [
    ...sprints.filter((s) => s.sprint.state === 'active'),
    ...sprints.filter((s) => s.sprint.state === 'future')
  ].sort((a, b) => order(a.sprint) - order(b.sprint))
  $: allRows = shown.filter((it) => isBacklogRow(toPlanIssue(client, it), epicIds)).sort(byRank)
  $: rows = allRows.filter((it) => matchesFilter(it, filter, me, $blockedIds))
  $: filtering = isFiltered(filter)
  $: backlogAll = group(allRows, new Set()).get(null) ?? []
  $: bySection = group(rows, new Set(sections.map((s) => s.doc._id as string)))
  $: sectionKeys = [...sections.map((s) => s.doc._id as string), null] as Array<string | null>

  function order (s: Sprint): number {
    return (s.state === 'active' ? 0 : 1e15) + (s.startDate ?? s.targetDate)
  }

  function group (list: Issue[], open: Set<string>): Map<string | null, Issue[]> {
    const map = new Map<string | null, Issue[]>([[null, []]])
    for (const id of open) map.set(id, [])
    for (const it of list) {
      const key = it.milestone ?? null
      if (key === null) {
        if (isOpen(toPlanIssue(client, it).status)) map.get(null)?.push(it)
      } else {
        map.get(key)?.push(it)
      }
    }
    return map
  }

  /** Everything in a sprint (sub-tasks included), for its totals and lifecycle. */
  function sprintIssues (id: Ref<Milestone>): Issue[] {
    return shown.filter((it) => it.milestone === id)
  }

  let collapsed = new Set<string>()
  function toggleCollapsed (key: string): void {
    collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key)
    collapsed = collapsed
  }

  let selected = new Set<Ref<Issue>>()
  function toggle (id: Ref<Issue>, on: boolean): void {
    on ? selected.add(id) : selected.delete(id)
    selected = selected
  }
  $: selectedIssues = rows.filter((it) => selected.has(it._id))

  let dropTarget: { section: string | null, before?: Ref<Issue> } | undefined
  function onDragStart (e: DragEvent, issue: Issue): void {
    const ids = selected.has(issue._id) ? [...selected] : [issue._id]
    e.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(ids))
    if (e.dataTransfer !== null) e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver (e: DragEvent, section: string | null, before?: Ref<Issue>): void {
    if (e.dataTransfer?.types.includes(DRAG_TYPE) !== true) return
    e.preventDefault()
    e.stopPropagation()
    dropTarget = { section, before }
  }
  async function onDrop (e: DragEvent, section: string | null, before?: Ref<Issue>): Promise<void> {
    const raw = e.dataTransfer?.getData(DRAG_TYPE)
    dropTarget = undefined
    if (raw === undefined || raw === '') return
    e.preventDefault()
    e.stopPropagation()
    const ids = new Set(JSON.parse(raw) as string[])
    const moving = rows.filter((it) => ids.has(it._id)).sort(byRank)
    const list = (bySection.get(section) ?? []).filter((it) => !ids.has(it._id))
    const at = before !== undefined ? list.findIndex((it) => it._id === before) : list.length
    const idx = at === -1 ? list.length : at
    await move(moving, section as Ref<Milestone> | null, { prev: list[idx - 1]?.rank, next: list[idx]?.rank })
  }

  async function move (list: Issue[], to: Ref<Milestone> | null, place?: { prev?: string, next?: string }): Promise<void> {
    const target = to === null ? undefined : milestones.find((m) => m._id === to)
    if (target !== undefined && !canAddToSprint(toSprint(target))) return
    const ids = new Set(list.map((it) => it._id as string))
    const children = shown.filter((it) => ids.has(it.attachedTo) && !ids.has(it._id) && (it.milestone ?? null) !== to)
    const ranks = place !== undefined ? ranksBetween(list.length, place) : []
    selected = new Set()
    await optimistic(
      list.map((it, i) => [it, place !== undefined ? { milestone: to, rank: ranks[i] } : { milestone: to }]),
      async () => {
        await moveIssues(client, list, to, place)
        if (children.length > 0) await moveIssues(client, children, to)
      }
    )
  }

  function pickTarget (anchor: PopupAlignment, list: Issue[]): void {
    const value: SelectPopupValueType[] = [
      ...sections.map((s) => ({ id: s.doc._id, text: s.doc.label, icon: icon.sprint })),
      { id: null, label: str.MoveToBacklog, icon: icon.backlog }
    ]
    showPopup(SelectPopup, { value }, anchor, async (to: Ref<Milestone> | null | undefined) => {
      if (to === undefined) return
      await move(list, to)
    })
  }

  async function bulk (update: Record<string, unknown>): Promise<void> {
    const list = selectedIssues
    await optimistic(
      list.map((it) => [it, update]),
      async () => {
        await updateIssues(client, list, update)
      }
    )
  }
  function bulkStatus (e: MouseEvent): void {
    if (project === undefined) return
    const value = projectStatuses(client, project).map((st) => ({ id: st._id, text: st.name }))
    showPopup(SelectPopup, { value }, e.currentTarget as HTMLElement, async (status) => {
      if (status != null) await bulk({ status })
    })
  }
  function bulkAssignee (e: MouseEvent): void {
    showPopup(
      AssigneePopup,
      { docQuery: { active: true }, selected: undefined, allowDeselect: true, titleDeselect: str.Unassigned },
      e.currentTarget as HTMLElement,
      async (result: Person | null | undefined) => {
        if (result !== undefined) await bulk({ assignee: result?._id ?? null })
      }
    )
  }
  function bulkPoints (e: MouseEvent): void {
    showPopup(PointsPicker, { value: null, scale: settings.scale, allowClear: true }, e.currentTarget as HTMLElement, async (points) => {
      if (points !== undefined) await bulk({ [ISSUE_POINTS]: points })
    })
  }
  function bulkEpic (e: MouseEvent): void {
    const list = selectedIssues.filter((it) => !isEpic(it))
    const value: SelectPopupValueType[] = [
      ...epics.map((it) => ({ id: it._id, text: `${it.identifier} ${it.title}`, icon: icon.epic })),
      { id: null, label: str.RemoveEpic }
    ]
    showPopup(SelectPopup, { value, searchable: true, placeholder: str.SearchEpics }, e.currentTarget as HTMLElement, async (to) => {
      if (to === undefined) return
      for (const it of list) await setEpic(client, it, to)
    })
  }
  const PRIORITY_ORDER = [0, 4, 3, 2, 1] as const
  function bulkPriority (e: MouseEvent): void {
    const value = PRIORITY_ORDER.map((id) => ({ id, ...issuePriorities[id] }))
    showPopup(SelectPopup, { value }, e.currentTarget as HTMLElement, async (priority) => {
      if (priority != null) await bulk({ priority })
    })
  }

  async function newSprint (): Promise<void> {
    if (project === undefined) return
    const d = nextSprintDefaults(milestones.map(toSprint), settings, project.identifier, Date.now())
    await createSprint(client, project._id, d)
  }

  function start (m: Milestone): void {
    showPopup(StartSprintDialog, { sprint: m, milestones, issues: sprintIssues(m._id), project }, 'top')
  }
  function complete (m: Milestone): void {
    showPopup(CompleteSprintDialog, { sprint: m, milestones, issues: sprintIssues(m._id), project }, 'top')
  }
  function sprintMenu (m: Milestone, state: Sprint['state'], anchor: HTMLElement): void {
    const value: SelectPopupValueType[] = [{ id: 'edit', label: str.EditSprint }]
    if (state === 'future') value.push({ id: 'delete', label: str.DeleteSprint })
    if (state === 'active') value.push({ id: 'cancelStart', label: str.CancelStart })
    showPopup(SelectPopup, { value }, anchor, (res) => {
      if (res === 'edit') showPopup(EditSprintDialog, { sprint: m }, 'top')
      if (res === 'cancelStart' && project !== undefined) {
        const p = project
        showPopup(
          MessageBox,
          { label: str.CancelStart, message: str.CancelStartConfirm, params: { name: m.label } },
          'top',
          async (ok?: boolean) => {
            if (ok === true) await cancelStart(client, p, m, sprintIssues(m._id))
          }
        )
      }
      if (res === 'delete') {
        const issues = sprintIssues(m._id)
        showPopup(
          MessageBox,
          { label: str.DeleteSprint, message: str.DeleteSprintConfirm, params: { name: m.label, count: issues.length }, dangerous: true },
          'top',
          async (ok?: boolean) => {
            if (ok === true) await deleteSprint(client, m, issues)
          }
        )
      }
    })
  }

  let creating: string | undefined
  const keyOf = (section: string | null): string => section ?? 'backlog'
  const asSprint = (section: string | null): Ref<Milestone> | null => section as Ref<Milestone> | null
  const anchorOf = (e: Event): HTMLElement => e.currentTarget as HTMLElement
  function openCreate (section: string | null): void {
    collapsed.delete(keyOf(section))
    collapsed = collapsed
    creating = keyOf(section)
  }
  function placeAtEnd (section: string | null): { prev?: string, next?: string } {
    const list = bySection.get(section) ?? []
    const last = list[list.length - 1]
    if (last === undefined) return {}
    const after = rows.find((it) => it.rank > last.rank)
    return { prev: last.rank, next: after?.rank }
  }

  let focusId: string | undefined
  $: flat = sectionKeys.flatMap((key) => (collapsed.has(keyOf(key)) ? [] : bySection.get(key) ?? []))
  function focusAt (i: number): void {
    focusId = flat[i]?._id
    if (focusId !== undefined) scrollToIssue(focusId)
  }
  const shortcuts: Array<[string[], IntlString]> = [
    [['j', 'k'], str.KbNavigate],
    [['Enter'], str.KbOpen],
    [['x'], str.KbSelect],
    [['s'], str.KbStatus],
    [['e'], str.KbPoints],
    [['a'], str.KbAssignee],
    [['p'], str.KbEpic],
    [['b'], str.BlockedByAction],
    [['m'], str.KbMove],
    [['c'], str.KbCreate],
    [['/'], str.SearchIssues],
    [['Esc'], str.KbClear],
    [['?'], str.KbHelp]
  ]
  function showHelp (): void {
    showPopup(ShortcutsHelp, { items: shortcuts }, 'top')
  }
  function onKey (e: KeyboardEvent): void {
    if (project === undefined || !isScrumProject(project) || shouldIgnore(e)) return
    const idx = focusId === undefined ? -1 : flat.findIndex((it) => it._id === focusId)
    const focused = idx >= 0 ? flat[idx] : undefined
    const press = (name: string): boolean => focused !== undefined && clickControl(focused._id, name)
    let handled = true
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        focusAt(step(idx, flat.length, 1))
        break
      case 'k':
      case 'ArrowUp':
        focusAt(step(idx, flat.length, -1))
        break
      case 'x':
        if (focused !== undefined) toggle(focused._id, !selected.has(focused._id))
        break
      case 'Enter':
        handled = press('open')
        break
      case 's':
        handled = press('status')
        break
      case 'e':
        handled = press('points')
        break
      case 'a':
        handled = press('assignee')
        break
      case 'p':
        handled = press('epic')
        break
      case 'b':
        if (focused !== undefined) void pickBlockers(client, focused, elementOf(focused._id) ?? 'top')
        else handled = false
        break
      case 'm': {
        const list = selectedIssues.length > 0 ? selectedIssues : focused !== undefined ? [focused] : []
        if (list.length > 0) pickTarget(elementOf(list[0]._id) ?? 'top', list)
        else handled = false
        break
      }
      case 'c':
        openCreate(focused !== undefined ? focused.milestone ?? null : null)
        break
      case '/':
        focusHeaderSearch()
        break
      case 'Escape':
        selected = new Set()
        focusId = undefined
        creating = undefined
        break
      case '?':
        showHelp()
        break
      default:
        handled = false
    }
    if (handled) e.preventDefault()
  }

  $: activeCount = sections.filter((s) => s.sprint.state === 'active').length
</script>

<svelte:window on:keydown={onKey} />

<Header adaptive={scrum ? 'doubleRow' : 'disabled'}>
  <Breadcrumbs items={[{ icon: icon.backlog, label: str.Planning }]} />
  <svelte:fragment slot="search">
    {#if scrum}<HeaderSearch space={currentSpace} bind:filter />{/if}
  </svelte:fragment>
  <svelte:fragment slot="actions">
    {#if project !== undefined && scrum}
      {#if !$deviceInfo.isMobile}
        <Button kind={'ghost'} size={'small'} label={getEmbeddedLabel('?')} showTooltip={{ label: str.KeyboardShortcuts }} on:click={showHelp} />
      {/if}
      <Button kind={'ghost'} size={'small'} label={str.SprintSettings} on:click={() => showPopup(SprintSettingsDialog, { project }, 'top')} />
      <Button
        icon={IconAdd}
        kind={'primary'}
        size={'small'}
        label={$deviceInfo.isMobile ? undefined : str.CreateSprint}
        on:click={newSprint}
      />
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="extra">
    {#if scrum}
      <QuickModes bind:filter estimates={settings.scale !== 'off'} />
      <EpicFilter {epics} bind:filter />
    {/if}
  </svelte:fragment>
</Header>

{#if project === undefined || !loaded}
  <Loading />
{:else if !isScrumProject(project)}
  <SetupPanel {project} />
{:else}
  <Filters space={currentSpace} bind:filter />
  <div class="relative flex min-h-0 flex-1 flex-col">
    <Scroller>
      <div class="flex shrink-0 flex-col gap-4 p-4 pb-16">
        {#each sectionKeys as key (key ?? 'backlog')}
          {@const entry = sections.find((s) => s.doc._id === key)}
          {@const list = bySection.get(key) ?? []}
          {@const plan = (key === null ? backlogAll : sprintIssues(key)).map((it) => toPlanIssue(client, it))}
          {@const t = totals(plan)}
          {@const collapsedKey = key ?? 'backlog'}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <section
            class="rounded-lg border bg-background {dropTarget?.section === key && dropTarget?.before === undefined ? 'ring-2 ring-primary/40' : ''}"
            on:dragover={(e) => onDragOver(e, key)}
            on:dragleave={() => (dropTarget = undefined)}
            on:drop={(e) => onDrop(e, key)}
          >
            <header class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
              <button type="button" class="flex min-w-0 items-center gap-2 text-left" on:click={() => toggleCollapsed(collapsedKey)}>
                <span class="flex text-muted-foreground transition-transform {collapsed.has(collapsedKey) ? '' : 'rotate-90'}">
                <IconCollapseArrow size={'small'} />
              </span>
                <span class="truncate font-semibold">
                  {#if entry !== undefined}{entry.doc.label}{:else}<Label label={str.Backlog} />{/if}
                </span>
              </button>
              {#if entry !== undefined}
                {#if entry.sprint.state === 'active'}
                  <span class="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary"><Label label={str.Current} /></span>
                {/if}
                <span class="text-xs text-muted-foreground">{fmtRange(entry.sprint.startDate, entry.sprint.targetDate)}</span>
                {#if entry.sprint.goal}
                  <span class="min-w-0 max-w-[40%] truncate text-xs text-muted-foreground" title={entry.sprint.goal}>{entry.sprint.goal}</span>
                {/if}
              {:else}
                <TotalsBadge totals={t} scale={settings.scale} />
              {/if}
              <div class="ml-auto flex items-center gap-1.5">
                {#if entry !== undefined}
                  <span class="mr-1.5">
                    <CycleProgress
                      split={statusSplit(plan, byPoints)}
                      {byPoints}
                      unpointed={t.unpointed}
                      capacity={entry.sprint.state === 'future' ? teamCapacity : undefined}
                    />
                  </span>
                {/if}
                {#if entry !== undefined && entry.sprint.state === 'future'}
                  <Button track={'tracker.sprint_start.open'}
                    kind={activeCount === 0 && sections[0]?.doc._id === key ? 'primary' : 'regular'}
                    size={'small'}
                    label={str.StartSprint}
                    on:click={() => start(entry.doc)}
                  />
                {:else if entry !== undefined && entry.sprint.state === 'active'}
                  <Button track={'tracker.sprint_complete.open'} kind={'regular'} size={'small'} label={str.CompleteSprint} on:click={() => complete(entry.doc)} />
                {/if}
                {#if entry !== undefined}
                  <button
                    type="button"
                    class="flex rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={sprintOptionsLabel}
                    use:tooltip={{ label: str.SprintOptions }}
                    on:click={(e) => sprintMenu(entry.doc, entry.sprint.state, e.currentTarget)}
                  >
                    <IconMoreH size={'small'} />
                  </button>
                {/if}
              </div>
            </header>
            {#if !collapsed.has(collapsedKey)}
              {#each list as issue (issue._id)}
                <IssueRow
                  {issue}
                  epic={epicById.get(issue.attachedTo)}
                  {epics}
                  scale={settings.scale}
                  selected={selected.has(issue._id)}
                  focused={focusId === issue._id}
                  dropBefore={dropTarget?.section === key && dropTarget?.before === issue._id}
                  on:toggle={(e) => toggle(issue._id, e.detail)}
                  on:dragstart={(e) => onDragStart(e.detail, issue)}
                  on:dragover={(e) => onDragOver(e, key, issue._id)}
                  on:drop={(e) => onDrop(e, key, issue._id)}
                />
              {:else}
                <p class="px-3 py-4 text-center text-xs text-muted-foreground">
                  <Label label={filtering ? str.NoMatches : key === null ? str.EmptyBacklog : str.EmptySprint} />
                </p>
              {/each}
              {#if creating === collapsedKey}
                <QuickCreateRow
                  {project}
                  sprint={asSprint(key)}
                  epic={filter.epic !== 'all' ? epicById.get(filter.epic) : undefined}
                  place={placeAtEnd(key)}
                  on:created={(e) => (focusId = e.detail)}
                  on:close={() => (creating = undefined)}
                />
              {:else}
                <button
                  type="button"
                  class="flex h-8 w-full items-center gap-1.5 px-3 text-left text-xs text-muted-foreground hover:bg-muted/60"
                  on:click={() => openCreate(key)}
                >
                  + <Label label={str.CreateIssue} />
                </button>
              {/if}
            {/if}
          </section>
        {/each}
        <SetupPanel {project} />
      </div>
    </Scroller>
    {#if selected.size > 0}
      <div
        class="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-lg border bg-popover p-1.5 text-xs shadow-lg"
      >
        <span class="mr-1 flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 font-medium">
          <Label label={str.Selected} params={{ count: selected.size }} />
          <button type="button" class="flex text-muted-foreground hover:text-foreground" on:click={() => (selected = new Set())}>
            <IconClose size={'x-small'} />
          </button>
        </span>
        <Button kind={'ghost'} size={'small'} label={str.MoveToSprint} on:click={(e) => pickTarget(anchorOf(e), selectedIssues)} />
        <Button kind={'ghost'} size={'small'} label={str.Status} on:click={bulkStatus} />
        <Button kind={'ghost'} size={'small'} label={str.Assignee} on:click={bulkAssignee} />
        {#if settings.scale !== 'off'}
          <Button kind={'ghost'} size={'small'} label={str.Points} on:click={bulkPoints} />
        {/if}
        <Button kind={'ghost'} size={'small'} label={str.Epic} on:click={bulkEpic} />
        <Button kind={'ghost'} size={'small'} label={str.Priority} on:click={bulkPriority} />
      </div>
    {/if}
  </div>
{/if}
