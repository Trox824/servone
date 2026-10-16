<!--
  Timeline, as Jira's: a Work column of epics with their issues on the left, the calendar on the
  right with a bar per epic and issue, a Sprints row and a Releases row pinned under the month
  header, and a line for today. Weeks / Months / Quarters zoom it; Today scrolls back to now.

  An issue's bar is its start and due dates, or its sprint's span when it has no start date, so
  sprint-planned work shows without anyone entering dates (see ../lib/timeline). An epic's bar
  spans its own dates and all of its issues. Bars drag to move and their ends drag to resize,
  which sets the issue's start and due dates. Status and assignee are changed in the row, with
  Huly's own pickers; the title opens the issue. Huly's filter narrows the work shown, and while
  it is on, epic bars and the Sprints row follow the matching work only.
-->
<script lang="ts">
  import type { DocumentQuery, Ref } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tags, { type TagElement } from '@hcengineering/tags'
  import tracker, { type Issue, type Milestone, type Project } from '@hcengineering/tracker'
  import {
    Breadcrumbs,
    Button,
    Header,
    IconAdd,
    IconCollapseArrow,
    Label,
    Loading,
    showPopup,
    Switcher,
    tooltip,
    type TabItem
  } from '@hcengineering/ui'
  import {
    FilterBar,
    FilterButton,
    claimResultCountOwner,
    openDoc,
    releaseResultCountOwner,
    setResultCount,
    type ResultCountOwner
  } from '@hcengineering/view-resources'
  import { onDestroy, onMount, tick as nextTick } from 'svelte'
  import AssigneeEditor from '../../components/issues/AssigneeEditor.svelte'
  import StatusEditor from '../../components/issues/StatusEditor.svelte'
  import CreateIssue from '../../components/CreateIssue.svelte'
  import { statusKindOf } from '../data'
  import {
    DAY_WIDTH,
    daysBetween,
    rangeOf,
    spanOf,
    ticksOf,
    unionOf,
    type Span,
    type SprintDates,
    type TimelineScale
  } from '../lib/timeline'
  import { DAY, type StatusKind } from '../lib/types'
  import { icon, str } from '../plugin'
  import { RELEASE_CATEGORY, toRelease, type Release } from '../releases'
  import { RELEASE } from '../scrum-spec'
  import { toSprint } from '../schema'
  import { isEpic, isScrumProject } from '../setup'
  import { byRank, fmtDate, fmtRange } from '../ui'
  import SetupPanel from './SetupPanel.svelte'

  export let currentSpace: Ref<Project>
  /** Under the Issues header (./TimelineView.svelte): no title or filter row of its own. */
  export let embedded = false

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let project: Project | undefined
  let issues: Issue[] = []
  let milestones: Milestone[] = []
  let releases: Release[] = []
  let loaded = false

  const projectQuery = createQuery()
  const issueQuery = createQuery()
  const milestoneQuery = createQuery()
  const releaseQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (res) => (project = res[0]))
  $: issueQuery.query(tracker.class.Issue, { space: currentSpace }, (res) => {
    issues = res
    loaded = true
  })
  export let filterQuery: DocumentQuery<Issue> | undefined = undefined
  let matched: Set<string> | undefined
  const matchQuery = createQuery()
  $: if (filterQuery !== undefined && Object.keys(filterQuery).some((k) => k !== 'space')) {
    matchQuery.query(tracker.class.Issue, { ...filterQuery, space: currentSpace }, (res) => (matched = new Set(res.map((it) => it._id))), {
      projection: { _id: 1 }
    })
  } else {
    matchQuery.unsubscribe()
    matched = undefined
  }
  let countOwner: ResultCountOwner | undefined
  $: if (embedded && countOwner === undefined) countOwner = claimResultCountOwner()
  $: if (countOwner !== undefined && loaded) setResultCount(countOwner, matched?.size ?? issues.length)
  onDestroy(() => {
    if (countOwner !== undefined) releaseResultCountOwner(countOwner)
  })
  $: milestoneQuery.query(tracker.class.Milestone, { space: currentSpace }, (res) => (milestones = res))
  $: releaseQuery.query(tags.class.TagElement, { category: RELEASE_CATEGORY, [RELEASE.project]: currentSpace } as any, (res) => {
    releases = (res as TagElement[]).map(toRelease).filter((r) => r.state !== 'archived')
  })

  const SCALE_KEY = 'servone.timeline.scale'
  let scale: TimelineScale = readScale()
  function readScale (): TimelineScale {
    try {
      const v = localStorage.getItem(SCALE_KEY)
      return v === 'months' || v === 'quarters' ? v : 'weeks'
    } catch {
      return 'weeks'
    }
  }
  $: try {
    localStorage.setItem(SCALE_KEY, scale)
  } catch {}
  const scales: TabItem[] = [
    { id: 'weeks', labelIntl: str.ScaleWeeks },
    { id: 'months', labelIntl: str.ScaleMonths },
    { id: 'quarters', labelIntl: str.ScaleQuarters }
  ]

  const today = Date.now()
  const LEFT = 360

  $: sprints = milestones.map(toSprint).sort((a, b) => (a.startDate ?? a.targetDate) - (b.startDate ?? b.targetDate))
  $: sprintDates = new Map<string, SprintDates>(sprints.map((s) => [s._id, { startDate: s.startDate, targetDate: s.targetDate }]))

  $: epics = issues.filter(isEpic).sort(byRank)
  $: epicIds = new Set<string>(epics.map((e) => e._id))
  $: childrenOf = groupChildren(issues, epicIds)
  $: loose = issues.filter((it) => !isEpic(it) && !epicIds.has(it.attachedTo as string)).sort(byRank)
  function groupChildren (list: Issue[], ids: Set<string>): Map<string, Issue[]> {
    const out = new Map<string, Issue[]>()
    for (const it of list) {
      if (isEpic(it) || !ids.has(it.attachedTo as string)) continue
      const arr = out.get(it.attachedTo as string) ?? []
      arr.push(it)
      out.set(it.attachedTo as string, arr)
    }
    for (const arr of out.values()) arr.sort(byRank)
    return out
  }

  $: spans = computeSpans(issues, sprintDates, childrenOf)
  function computeSpans (list: Issue[], sd: Map<string, SprintDates>, kids: Map<string, Issue[]>): Map<string, Span | undefined> {
    const out = new Map<string, Span | undefined>()
    for (const it of list) if (!isEpic(it)) out.set(it._id, spanOf(it, sd))
    for (const it of list) {
      if (!isEpic(it)) continue
      const own = it.startDate != null || it.dueDate != null ? spanOf({ startDate: it.startDate, dueDate: it.dueDate }, sd) : undefined
      out.set(it._id, own ?? unionOf((kids.get(it._id) ?? []).map((k) => out.get(k._id))))
    }
    return out
  }

  $: releaseSpans = releases.map((r) => {
    const at = r.releaseDate ?? r.releasedAt
    return at !== undefined ? { start: at, end: at } : undefined
  })
  $: range = rangeOf(
    [
      ...spans.values(),
      ...sprints.map((s) => ({ start: s.startDate ?? s.targetDate, end: s.targetDate })),
      ...releaseSpans
    ],
    today,
    scale
  )
  $: dw = DAY_WIDTH[scale]
  $: totalDays = daysBetween(range.start, range.end)
  let viewW = 0
  $: width = Math.max(totalDays * dw, viewW - LEFT)
  $: ticks = ticksOf(range, scale)
  $: todayX = daysBetween(range.start, today) * dw

  let x: (t: number) => number
  let w: (s: Span) => number
  $: x = (t: number): number => daysBetween(range.start, t) * dw
  $: w = (s: Span): number => Math.max(dw, (daysBetween(s.start, s.end) + 1) * dw)

  let collapsed = new Set<string>(['__loose'])
  function toggle (id: string): void {
    collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id)
    collapsed = collapsed
  }

  interface Row { issue: Issue, depth: 0 | 1 }
  $: rows = buildRows(epics, childrenOf, collapsed, matched)
  function buildRows (eps: Issue[], kids: Map<string, Issue[]>, closed: Set<string>, m: Set<string> | undefined): Row[] {
    const out: Row[] = []
    for (const e of eps) {
      const shown = (kids.get(e._id) ?? []).filter((k) => m === undefined || m.has(k._id))
      if (m !== undefined && !m.has(e._id) && shown.length === 0) continue
      out.push({ issue: e, depth: 0 })
      if (!closed.has(e._id)) for (const k of shown) out.push({ issue: k, depth: 1 })
    }
    return out
  }
  $: shownLoose = matched === undefined ? loose : loose.filter((it) => matched?.has(it._id))

  $: barSpans = filteredSpans(spans, epics, childrenOf, matched)
  function filteredSpans (all: Map<string, Span | undefined>, eps: Issue[], kids: Map<string, Issue[]>, m: Set<string> | undefined): Map<string, Span | undefined> {
    if (m === undefined) return all
    const out = new Map(all)
    for (const e of eps) {
      const shown = (kids.get(e._id) ?? []).filter((k) => m.has(k._id))
      if (shown.length > 0) out.set(e._id, unionOf(shown.map((k) => all.get(k._id))))
      else if (e.startDate != null || e.dueDate != null) out.set(e._id, spanOf({ startDate: e.startDate, dueDate: e.dueDate }, sprintDates))
    }
    return out
  }
  $: shownSprints = matched === undefined ? sprints : sprints.filter((s) => issues.some((it) => it.milestone === s._id && matched?.has(it._id)))

  function kindOf (it: Issue): StatusKind {
    return statusKindOf(client, it.status)
  }
  let progressOf: (epic: Issue) => number
  $: progressOf = (epic: Issue): number => {
    const kids = (childrenOf.get(epic._id) ?? []).filter((k) => kindOf(k) !== 'canceled')
    if (kids.length === 0) return kindOf(epic) === 'done' ? 1 : 0
    return kids.filter((k) => kindOf(k) === 'done').length / kids.length
  }
  const BAR: Record<StatusKind, string> = {
    unstarted: 'bg-muted-foreground/30',
    todo: 'bg-muted-foreground/40',
    active: 'bg-primary',
    done: 'bg-emerald-500',
    canceled: 'bg-muted-foreground/20'
  }

  let scroller: HTMLDivElement | undefined
  async function scrollToToday (): Promise<void> {
    await nextTick()
    if (scroller !== undefined) scroller.scrollLeft = Math.max(0, todayX - 160)
  }
  let scrolled = false
  $: if (!scrolled && loaded && scroller !== undefined) {
    scrolled = true
    void scrollToToday()
  }
  let lastScale = scale
  $: if (scale !== lastScale) {
    lastScale = scale
    void scrollToToday()
  }
  onMount(() => {
    const onUp = (): void => {
      void endDrag()
    }
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
    }
  })

  type DragMode = 'move' | 'start' | 'end'
  let drag: { issue: Issue, mode: DragMode, x0: number, span: Span, days: number } | undefined
  function startDrag (e: PointerEvent, issue: Issue, mode: DragMode): void {
    const span = barSpans.get(issue._id)
    if (span === undefined || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    drag = { issue, mode, x0: e.clientX, span, days: 0 }
  }
  function onMove (e: PointerEvent): void {
    if (drag === undefined) return
    drag = { ...drag, days: Math.round((e.clientX - drag.x0) / dw) }
  }
  /** The span as the drag has it; `dr` is passed in so Svelte redraws the bar as the drag moves. */
  function preview (s: Span | undefined, id: string, dr: typeof drag): Span | undefined {
    if (s === undefined || dr === undefined || dr.issue._id !== id || dr.days === 0) return s
    const d = dr.days * DAY
    if (dr.mode === 'move') return { start: s.start + d, end: s.end + d }
    if (dr.mode === 'start') return { start: Math.min(s.start + d, s.end), end: s.end }
    return { start: s.start, end: Math.max(s.end + d, s.start) }
  }
  async function endDrag (): Promise<void> {
    const d = drag
    drag = undefined
    if (d === undefined) return
    if (d.days === 0) {
      if (d.mode === 'move') await openDoc(hierarchy, d.issue)
      return
    }
    const s = preview(d.span, d.issue._id, d)
    if (s === undefined) return
    await client.update(d.issue, { startDate: s.start, dueDate: s.end })
  }
  function stopDrag (e: KeyboardEvent): void {
    if (e.key === 'Escape') drag = undefined
  }

  function newEpic (): void {
    showPopup(CreateIssue, { space: currentSpace, shouldSaveDraft: false }, 'top')
  }

  function releaseLook (r: Release): string {
    if (r.state === 'released') return 'bg-emerald-500'
    if (r.releaseDate !== undefined && r.releaseDate < today) return 'bg-destructive'
    return 'bg-primary'
  }
  const SPRINT_LOOK: Record<string, string> = {
    active: 'bg-primary/25 text-foreground border-primary/50',
    future: 'bg-muted text-muted-foreground border-border',
    closed: 'bg-emerald-500/15 text-muted-foreground border-emerald-500/40'
  }
</script>

<svelte:window on:pointermove={onMove} on:keydown={stopDrag} />

{#if embedded}
  <div class="flex shrink-0 items-center justify-end gap-2 border-b px-3 py-1.5">
    <Button kind={'regular'} size={'small'} label={str.Today} on:click={scrollToToday} />
    <Switcher name={'timeline-scale'} items={scales} selected={scale} kind={'subtle'} on:select={(e) => (scale = e.detail.id)} />
    {#if project !== undefined && isScrumProject(project)}
      <Button track={'tracker.epic_create.open'} icon={IconAdd} kind={'primary'} size={'small'} label={str.NewEpic} on:click={newEpic} />
    {/if}
  </div>
{:else}
  <Header adaptive={'disabled'}>
    <Breadcrumbs items={[{ icon: icon.timeline, label: str.Timeline }]} />
    <svelte:fragment slot="actions">
      <FilterButton _class={tracker.class.Issue} space={currentSpace} />
      <Button kind={'regular'} size={'small'} label={str.Today} on:click={scrollToToday} />
      <Switcher name={'timeline-scale'} items={scales} selected={scale} kind={'subtle'} on:select={(e) => (scale = e.detail.id)} />
      {#if project !== undefined && isScrumProject(project)}
        <Button track={'tracker.epic_create.open'} icon={IconAdd} kind={'primary'} size={'small'} label={str.NewEpic} on:click={newEpic} />
      {/if}
    </svelte:fragment>
  </Header>
  <FilterBar _class={tracker.class.Issue} space={currentSpace} query={{ space: currentSpace }} on:change={(e) => (filterQuery = e.detail)} />
{/if}

{#if project === undefined || !loaded}
  <Loading />
{:else if !isScrumProject(project)}
  <SetupPanel {project} />
{:else if epics.length === 0 && loose.length === 0}
  <div class="mx-auto flex max-w-md flex-col items-center gap-1 p-10 text-center text-sm">
    <div class="font-semibold"><Label label={str.TimelineEmpty} /></div>
    <p class="text-muted-foreground"><Label label={str.TimelineEmptyHint} /></p>
  </div>
{:else}
  <div class="relative min-h-0 flex-1 overflow-auto text-sm {drag !== undefined ? 'select-none' : ''}" bind:this={scroller} bind:clientWidth={viewW}>
    <div class="relative" style:width="{LEFT + width}px">
      <!-- Pinned header: months (or quarters), weeks (or months), then the Sprints and Releases rows. -->
      <div class="sticky top-0 z-20 border-b bg-background">
        <div class="flex h-7">
          <div class="sticky left-0 z-10 flex shrink-0 items-end border-r bg-background px-3 text-xs font-medium text-muted-foreground" style:width="{LEFT}px">
            <Label label={str.Work} />
          </div>
          <div class="relative" style:width="{width}px">
            {#each ticks.upper as t (t.at)}
              <div class="absolute top-0 flex h-full items-end border-l pb-0.5 text-xs font-medium" style:left="{t.offset * dw}px" style:width="{t.days * dw}px">
                <!-- Sticks just right of the Work column, so the month in view stays named. -->
                <span class="sticky truncate px-2" style:left="{LEFT}px">{t.label}</span>
              </div>
            {/each}
          </div>
        </div>
        {#if ticks.lower.length > 0}
        <div class="flex h-6">
          <div class="sticky left-0 z-10 shrink-0 border-r bg-background" style:width="{LEFT}px"></div>
          <div class="relative" style:width="{width}px">
            {#each ticks.lower as t (t.at)}
              <div class="absolute top-0 flex h-full items-center border-l px-1.5 text-[11px] text-muted-foreground" style:left="{t.offset * dw}px" style:width="{t.days * dw}px">
                <span class="truncate">{t.label}</span>
              </div>
            {/each}
          </div>
        </div>
        {/if}
        <div class="flex h-8 border-t">
          <div class="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-background px-3 text-xs text-muted-foreground" style:width="{LEFT}px">
            <Label label={str.Sprints} />
          </div>
          <div class="relative" style:width="{width}px">
            {#each shownSprints as s (s._id)}
              {@const span = { start: s.startDate ?? s.targetDate, end: s.targetDate }}
              <div
                class="absolute top-1.5 flex h-5 items-center overflow-hidden rounded border px-1.5 text-[11px] {SPRINT_LOOK[s.state]}"
                style:left="{x(span.start)}px"
                style:width="{w(span)}px"
                use:tooltip={{ label: getEmbeddedLabel(`${s.label} · ${fmtRange(span.start, span.end)}`) }}
              >
                <span class="truncate">{s.label}</span>
              </div>
            {/each}
          </div>
        </div>
        <div class="flex h-8 border-t">
          <div class="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-background px-3 text-xs text-muted-foreground" style:width="{LEFT}px">
            <Label label={str.Releases} />
          </div>
          <div class="relative" style:width="{width}px">
            {#each releases as r (r.doc._id)}
              {@const at = r.releaseDate ?? r.releasedAt}
              {#if at !== undefined}
                <div
                  class="absolute top-1.5 flex h-5 items-center gap-1 whitespace-nowrap text-[11px]"
                  style:left="{x(at) + dw / 2 - 5}px"
                  use:tooltip={{ label: getEmbeddedLabel(`${r.name} · ${fmtDate(at)}`) }}
                >
                  <span class="size-2.5 rotate-45 rounded-[2px] {releaseLook(r)}"></span>
                  <span class="text-muted-foreground">{r.name}</span>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      </div>

      <!-- Month lines behind the rows. -->
      <div class="pointer-events-none absolute inset-y-0 z-0" style:left="{LEFT}px" style:width="{width}px">
        {#each ticks.upper as t (t.at)}
          <div class="absolute inset-y-0 border-l border-border/60" style:left="{t.offset * dw}px"></div>
        {/each}
      </div>
      <!-- Today above the bar cells (z-[1]) but below the sticky name column (z-10), so it never draws over names. -->
      {#if todayX >= 0 && todayX <= width}
        <div
          class="pointer-events-none absolute inset-y-0 z-[5] w-px bg-destructive"
          style:left="{LEFT + todayX + dw / 2}px"
        ></div>
      {/if}

      {#each rows as row (row.issue._id)}
        {@const it = row.issue}
        {@const span = preview(barSpans.get(it._id), it._id, drag)}
        {@const epic = row.depth === 0}
        <div class="group relative flex h-9 hover:bg-muted/40">
          <div class="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r bg-background pr-2 group-hover:bg-muted" style:width="{LEFT}px" style:padding-left="{epic ? 8 : 32}px">
            {#if epic}
              <button
                type="button"
                class="flex text-muted-foreground transition-transform disabled:opacity-30 {collapsed.has(it._id) ? '' : 'rotate-90'}"
                disabled={(childrenOf.get(it._id) ?? []).length === 0}
                on:click={() => toggle(it._id)}
              >
                <IconCollapseArrow size={'small'} />
              </button>
            {/if}
            <StatusEditor value={it} kind={'list'} size={'small'} />
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <span
              class="min-w-0 flex-1 cursor-pointer truncate hover:underline {epic ? 'font-medium' : 'text-muted-foreground'}"
              title={it.title}
              on:click={() => openDoc(hierarchy, it)}
            >
              <span class="mr-1.5 text-xs text-muted-foreground">{it.identifier}</span>{it.title}
            </span>
            <AssigneeEditor object={it} kind={'list'} size={'small'} shouldShowName={false} />
          </div>
          <div class="relative z-[1]" style:width="{width}px">
            {#if span !== undefined}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="absolute flex cursor-grab items-center overflow-hidden rounded-md active:cursor-grabbing {epic
                  ? 'top-1.5 h-6 border border-violet-500/60 bg-violet-500/20'
                  : `top-2.5 h-4 ${BAR[kindOf(it)]}`}"
                style:left="{x(span.start)}px"
                style:width="{w(span)}px"
                use:tooltip={{ label: getEmbeddedLabel(`${it.identifier} ${it.title} · ${fmtRange(span.start, span.end)}`) }}
                on:pointerdown={(e) => startDrag(e, it, 'move')}
              >
                {#if epic}
                  <div class="absolute inset-y-0 left-0 bg-violet-500/50" style:width="{Math.round(progressOf(it) * 100)}%"></div>
                  <span class="relative truncate px-2 text-xs font-medium">{it.title}</span>
                {/if}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" on:pointerdown={(e) => startDrag(e, it, 'start')}></div>
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" on:pointerdown={(e) => startDrag(e, it, 'end')}></div>
              </div>
            {/if}
          </div>
        </div>
      {/each}

      {#if shownLoose.length > 0}
        <div class="flex h-9 border-t">
          <div class="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r bg-background px-2 text-xs font-medium text-muted-foreground" style:width="{LEFT}px">
            <button type="button" class="flex transition-transform {collapsed.has('__loose') ? '' : 'rotate-90'}" on:click={() => toggle('__loose')}>
              <IconCollapseArrow size={'small'} />
            </button>
            <Label label={str.NoEpic} /> · {shownLoose.length}
          </div>
        </div>
        {#if !collapsed.has('__loose')}
          {#each shownLoose as it (it._id)}
            {@const span = preview(barSpans.get(it._id), it._id, drag)}
            <div class="group relative flex h-9 hover:bg-muted/40">
              <div class="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r bg-background pl-8 pr-2 group-hover:bg-muted" style:width="{LEFT}px">
                <StatusEditor value={it} kind={'list'} size={'small'} />
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <span class="min-w-0 flex-1 cursor-pointer truncate text-muted-foreground hover:underline" title={it.title} on:click={() => openDoc(hierarchy, it)}>
                  <span class="mr-1.5 text-xs">{it.identifier}</span>{it.title}
                </span>
                <AssigneeEditor object={it} kind={'list'} size={'small'} shouldShowName={false} />
              </div>
              <div class="relative z-[1]" style:width="{width}px">
                {#if span !== undefined}
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div
                    class="absolute top-2.5 h-4 cursor-grab overflow-hidden rounded-md active:cursor-grabbing {BAR[kindOf(it)]}"
                    style:left="{x(span.start)}px"
                    style:width="{w(span)}px"
                    use:tooltip={{ label: getEmbeddedLabel(`${it.identifier} ${it.title} · ${fmtRange(span.start, span.end)}`) }}
                    on:pointerdown={(e) => startDrag(e, it, 'move')}
                  >
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" on:pointerdown={(e) => startDrag(e, it, 'start')}></div>
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" on:pointerdown={(e) => startDrag(e, it, 'end')}></div>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </div>
{/if}
