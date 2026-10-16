<!-- Computed from issue history (./data#loadHistories → ./lib/report), so sprints from before the report are covered. -->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tracker, { type Issue, type Milestone, type Project } from '@hcengineering/tracker'
  import { PersonRefPresenter } from '@hcengineering/contact-resources'
  import { Breadcrumbs, Button, DropdownLabels, Header, Label, Loading, Scroller, Switcher } from '@hcengineering/ui'
  import IssuePresenter from '../../components/issues/IssuePresenter.svelte'
  import StatusEditor from '../../components/issues/StatusEditor.svelte'
  import { HISTORY_CAP, loadHistories, toPlanIssue, updateSprint } from '../data'
  import { cumulativeFlow, cycleTimes, percentile, type CycleTime, type FlowPoint } from '../lib/flow'
  import { breakdown, weigh, type BreakdownBy } from '../lib/breakdown'
  import { reopenSprint } from '../lib/lifecycle'
  import { snapshotCycleTimes, snapshotPlanIssues } from '../lib/snapshot'
  import { sprintReport, velocity, type SprintReport } from '../lib/report'
  import type { Sprint } from '../lib/types'
  import { icon, str } from '../plugin'
  import { issuePoints, projectSettings, toSprint } from '../schema'
  import { canSetUp, isScrumProject } from '../setup'
  import { daysLeft, fmtDate, fmtRange } from '../ui'
  import BurndownChart from './BurndownChart.svelte'
  import CycleTimeChart from './CycleTimeChart.svelte'
  import FlowChart from './FlowChart.svelte'
  import SetupPanel from './SetupPanel.svelte'
  import VelocityChart from './VelocityChart.svelte'

  export let currentSpace: Ref<Project>

  const VELOCITY_SPRINTS = 7
  const client = getClient()

  let project: Project | undefined
  let milestones: Milestone[] = []
  const projectQuery = createQuery()
  const milestoneQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (res) => (project = res[0]))
  $: milestoneQuery.query(tracker.class.Milestone, { space: currentSpace }, (res) => (milestones = res))

  $: settings = projectSettings(project)
  $: byPoints = settings.scale !== 'off'
  $: sprints = milestones.map(toSprint)
  $: reportable = sprints
    .filter((s) => s.state !== 'future')
    .sort((a, b) => (b.startDate ?? b.targetDate) - (a.startDate ?? a.targetDate))
  let selectedId: string | undefined
  $: if (selectedId === undefined || !reportable.some((s) => s._id === selectedId)) selectedId = reportable[0]?._id
  $: selected = reportable.find((s) => s._id === selectedId)

  /** Issues that are, or were at completion, in a sprint. */
  async function sprintMembers (s: Sprint): Promise<Issue[]> {
    const now = await client.findAll(tracker.class.Issue, { space: currentSpace, milestone: s._id as Ref<Milestone> })
    const rolled = (s.rolledOver ?? []).filter((id) => !now.some((it) => it._id === id))
    const moved = rolled.length > 0 ? await client.findAll(tracker.class.Issue, { _id: { $in: rolled as Array<Ref<Issue>> } }) : []
    return [...now, ...moved]
  }

  let report: SprintReport | undefined
  let flow: FlowPoint[] = []
  let cycles: CycleTime[] = []
  type Chart = 'burndown' | 'burnup' | 'flow'
  let chart: Chart = 'burndown'
  function pickChart (e: CustomEvent<{ id: string }>): void {
    chart = e.detail.id as Chart
  }
  $: cycleDays = cycles.map((c) => c.days)
  $: cycleMedian = percentile(cycleDays, 50) ?? 0
  $: cycleP85 = percentile(cycleDays, 85) ?? 0
  $: cycleItems = cycles.map((c) => {
    const it = members.get(c._id)
    return { ...c, label: it !== undefined ? `${it.identifier} ${it.title}` : c._id }
  })
  const roundDays = (d: number): number => Math.round(d * 10) / 10
  let members = new Map<string, Issue>()
  let loading = false
  let capped = false
  let requestId = 0
  $: void load(selected, byPoints)
  async function load (s: Sprint | undefined, points: boolean): Promise<void> {
    const id = ++requestId
    if (s === undefined) {
      report = undefined
      return
    }
    loading = true
    const list = await sprintMembers(s)
    const histories = await loadHistories(client, list)
    if (id !== requestId) return
    members = new Map(list.map((it) => [it._id as string, it]))
    capped = list.length > HISTORY_CAP
    const now = Date.now()
    report = sprintReport(s, histories, points, now)
    flow = cumulativeFlow(s, histories, points, now)
    cycles = s.state === 'closed' && s.issuesSnapshot !== undefined ? snapshotCycleTimes(s.issuesSnapshot) : cycleTimes(histories, report.completed)
    loading = false
  }

  let fallbacks = new Map<string, { committed: number, completed: number }>()
  $: closedWithoutSnapshot = sprints.filter(
    (s) => s.state === 'closed' && (s.committedPoints === undefined || s.completedPoints === undefined)
  )
  $: void loadFallbacks(closedWithoutSnapshot)
  async function loadFallbacks (list: Sprint[]): Promise<void> {
    const out = new Map<string, { committed: number, completed: number }>()
    for (const s of list.slice(-VELOCITY_SPRINTS)) {
      const issues = await sprintMembers(s)
      const r = sprintReport(s, await loadHistories(client, issues), true, Date.now())
      const byId = new Map(issues.map((it) => [it._id as string, it]))
      const completed = r.completed.reduce((sum, id) => {
        const it = byId.get(id)
        return sum + (it !== undefined ? issuePoints(it) ?? 0 : 0)
      }, 0)
      out.set(s._id, { committed: r.committed, completed })
    }
    fallbacks = out
  }
  $: velocityEntries = velocity(sprints, VELOCITY_SPRINTS, (s) => fallbacks.get(s._id))

  async function reopen (): Promise<void> {
    const doc = milestones.find((m) => m._id === selected?._id)
    if (doc === undefined || selected === undefined) return
    const r = reopenSprint(selected, sprints, canSetUp())
    if (r.ok) await updateSprint(client, doc, r.value)
  }

  function issuesOf (ids: string[]): Issue[] {
    return ids.map((id) => members.get(id)).filter((it): it is Issue => it !== undefined)
  }

  $: plan = new Map([...members.values()].map((it) => [it._id as string, toPlanIssue(client, it)]))
  $: unit = byPoints ? str.PointsShort : str.IssueCount
  $: snapshot = byPoints ? selected?.completedPoints : selected?.completedCount
  $: completedValue = report === undefined ? 0 : snapshot ?? weigh(report.completed, plan, byPoints)
  $: openValue = report === undefined ? 0 : weigh(report.notCompleted, plan, byPoints)
  $: addedValue = report === undefined ? 0 : weigh(report.added, plan, byPoints)
  $: removedValue = report === undefined ? 0 : weigh(report.removed, plan, byPoints)
  $: committedCount =
    selected?.committedCount ??
    (report === undefined ? 0 : report.completed.length + report.notCompleted.length - report.added.length + report.removed.length)
  $: scopeNow = completedValue + openValue
  $: percentDone = scopeNow > 0 ? Math.round((completedValue / scopeNow) * 100) : 0
  $: percentOfCommitted = report !== undefined && report.committed > 0 ? Math.round((completedValue / report.committed) * 100) : 0

  interface Stat {
    label: IntlString
    value: number
    sign?: string
    note: IntlString
    params: Record<string, any>
  }
  let stats: Stat[] = []
  $: stats =
    report === undefined
      ? []
      : [
          { label: str.Committed, value: report.committed, note: str.IssueCount, params: { count: committedCount } },
          { label: str.Completed, value: completedValue, note: str.PercentOfCommitted, params: { percent: percentOfCommitted } },
          { label: str.NotCompleted, value: openValue, note: str.IssueCount, params: { count: report.notCompleted.length } },
          {
            label: str.ScopeChange,
            value: addedValue - removedValue,
            sign: addedValue - removedValue > 0 ? '+' : '',
            note: str.AddedRemoved,
            params: { added: report.added.length, removed: report.removed.length }
          }
        ]

  let by: BreakdownBy = 'assignee'
  function pickBy (e: CustomEvent<{ id: string }>): void {
    by = e.detail.id as BreakdownBy
  }
  $: closedSnapshot = selected?.state === 'closed' ? selected.issuesSnapshot : undefined
  $: breakdownIssues =
    closedSnapshot !== undefined && selected !== undefined
      ? snapshotPlanIssues(closedSnapshot, selected._id)
      : issuesOf(report === undefined ? [] : [...report.completed, ...report.notCompleted]).map((it) => toPlanIssue(client, it))
  $: rows = report === undefined ? [] : breakdown(breakdownIssues, by, byPoints)
  let epicTitles = new Map<string, string>()
  $: void loadEpics(members)
  async function loadEpics (list: Map<string, Issue>): Promise<void> {
    const ids = [...new Set([...list.values()].map((it) => it.attachedTo).filter((p) => p !== tracker.ids.NoParent))]
    const epics = ids.length > 0 ? await client.findAll(tracker.class.Issue, { _id: { $in: ids as Array<Ref<Issue>> } }) : []
    epicTitles = new Map(epics.map((e) => [e._id as string, e.title]))
  }

  type Tab = 'completed' | 'notCompleted' | 'added' | 'removed'
  let tab: Tab = 'notCompleted'
  $: tabs =
    report === undefined
      ? []
      : ([
          ['completed', str.Completed, report.completed],
          ['notCompleted', str.NotCompleted, report.notCompleted],
          ['added', str.AddedAfterStart, report.added],
          ['removed', str.RemovedDuringSprint, report.removed]
        ] as Array<[Tab, IntlString, string[]]>)
  $: tabIssues = issuesOf(tabs.find(([id]) => id === tab)?.[2] ?? [])
  $: averageVelocity =
    velocityEntries.length > 0 ? Math.round(velocityEntries.reduce((sum, e) => sum + e.completed, 0) / velocityEntries.length) : 0
</script>

<Header adaptive={'disabled'}>
  <Breadcrumbs items={[{ icon: icon.report, label: str.SprintReport }]} />
  <svelte:fragment slot="actions">
    {#if selected?.state === 'closed' && canSetUp()}
      <Button kind={'ghost'} size={'small'} label={str.ReopenSprint} on:click={reopen} />
    {/if}
    {#if reportable.length > 0}
      <DropdownLabels
        items={reportable.map((s) => ({ id: s._id, label: s.label }))}
        icon={icon.sprint}
        kind={'regular'}
        size={'small'}
        showDropdownIcon
        bind:selected={selectedId}
      />
    {/if}
  </svelte:fragment>
</Header>

{#if project === undefined}
  <Loading />
{:else if !isScrumProject(project)}
  <SetupPanel {project} />
{:else if selected === undefined}
  <p class="p-10 text-center text-sm text-muted-foreground"><Label label={str.NoClosedSprints} /></p>
{:else}
  <Scroller>
    <div class="mx-auto flex w-full max-w-6xl shrink-0 flex-col gap-5 px-8 py-6 text-foreground">
      <section class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 class="m-0 text-xl font-semibold tracking-tight">{selected.label}</h2>
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium {selected.state === 'active'
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground'}"
          >
            <Label label={selected.state === 'active' ? str.Active : str.Closed} />
          </span>
          <span class="text-sm text-muted-foreground">{fmtRange(selected.startDate, selected.targetDate)}</span>
          <span class="text-sm text-muted-foreground">·</span>
          <span class="text-sm text-muted-foreground">
            {#if selected.state === 'active'}
              <Label label={str.DaysLeft} params={{ count: Math.max(0, daysLeft(selected.targetDate)) }} />
            {:else}
              <Label label={str.Ended} /> {fmtDate(selected.completedAt ?? selected.targetDate)}
            {/if}
          </span>
        </div>
        {#if selected.goal}
          <p class="m-0 max-w-3xl text-sm text-muted-foreground">{selected.goal}</p>
        {/if}
        {#if report !== undefined}
          <div class="flex items-center gap-3">
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <div class="h-full rounded-full bg-emerald-500 transition-all" style:width="{percentDone}%"></div>
            </div>
            <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
              <Label label={str.PercentComplete} params={{ percent: percentDone }} />
            </span>
          </div>
        {/if}
      </section>

      {#if loading && report === undefined}
        <Loading />
      {:else if report !== undefined}
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {#each stats as st}
            <div class="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3">
              <span class="text-xs font-medium text-muted-foreground"><Label label={st.label} /></span>
              <span class="text-2xl font-semibold tabular-nums tracking-tight">
                {st.sign ?? ''}<Label label={unit} params={{ count: st.value }} />
              </span>
              <span class="text-xs text-muted-foreground"><Label label={st.note} params={st.params} /></span>
            </div>
          {/each}
        </div>
        {#if capped}
          <p class="text-xs text-amber-600"><Label label={str.HistoryCap} params={{ count: HISTORY_CAP }} /></p>
        {/if}

        <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <section class="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 lg:col-span-2">
            <div class="flex items-center justify-between gap-2">
              <h3 class="m-0 text-sm font-semibold">
                <Label label={chart === 'flow' ? str.CumulativeFlow : chart === 'burnup' ? str.Burnup : str.Burndown} />
              </h3>
              <Switcher
                name={'sprint-report-chart'}
                items={[
                  { id: 'burndown', labelIntl: str.Burndown },
                  { id: 'burnup', labelIntl: str.Burnup },
                  { id: 'flow', labelIntl: str.CumulativeFlow }
                ]}
                selected={chart}
                kind={'subtle'}
                on:select={pickChart}
              />
            </div>
            {#if chart === 'flow'}
              <FlowChart points={flow} />
            {:else}
              <BurndownChart points={report.burndown} mode={chart} />
            {/if}
          </section>
          <section class="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
            <div class="flex items-center justify-between gap-2">
              <h3 class="m-0 text-sm font-semibold"><Label label={str.Breakdown} /></h3>
              <Switcher
                name={'sprint-report-breakdown'}
                items={[
                  { id: 'assignee', labelIntl: str.Assignee },
                  { id: 'epic', labelIntl: str.Epic }
                ]}
                selected={by}
                kind={'subtle'}
                on:select={pickBy}
              />
            </div>
            {#if rows.length === 0}
              <p class="text-xs text-muted-foreground"><Label label={str.NothingHere} /></p>
            {:else}
              <ul class="m-0 flex list-none flex-col gap-3 p-0">
                {#each rows as r (r.key)}
                  <li class="flex flex-col gap-1.5">
                    <div class="flex min-w-0 items-center justify-between gap-2 text-sm">
                      <div class="min-w-0 truncate">
                        {#if r.key === ''}
                          <span class="text-muted-foreground"><Label label={by === 'assignee' ? str.Unassigned : str.NoEpic} /></span>
                        {:else if by === 'assignee'}
                          <PersonRefPresenter value={r.key} />
                        {:else}
                          <span title={epicTitles.get(r.key)}>{epicTitles.get(r.key) ?? '…'}</span>
                        {/if}
                      </div>
                      <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{r.done} / {r.total}</span>
                    </div>
                    <div class="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                      <div class="h-full rounded-full bg-emerald-500" style:width="{r.total > 0 ? (r.done / r.total) * 100 : 0}%"></div>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </div>

        <section class="flex flex-col rounded-lg border bg-card">
          <div class="flex flex-wrap items-center gap-1 border-b px-3 py-2">
            {#each tabs as [id, label, ids]}
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm {tab === id
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'}"
                on:click={() => (tab = id)}
              >
                <Label {label} />
                <span class="rounded-full bg-muted px-1.5 text-xs tabular-nums">{ids.length}</span>
              </button>
            {/each}
          </div>
          {#if tabIssues.length === 0}
            <p class="px-4 py-6 text-center text-sm text-muted-foreground"><Label label={str.NothingHere} /></p>
          {:else}
            {#each tabIssues as issue (issue._id)}
              <div class="flex h-10 items-center gap-3 border-b px-4 text-sm last:border-b-0">
                <div class="w-24 shrink-0"><IssuePresenter value={issue} shouldShowAvatar kind={'list'} /></div>
                <span class="min-w-0 flex-1 truncate">{issue.title}</span>
                {#if epicTitles.has(issue.attachedTo)}
                  <span class="hidden max-w-48 shrink-0 truncate text-xs text-muted-foreground md:block">{epicTitles.get(issue.attachedTo)}</span>
                {/if}
                <div class="w-28 shrink-0"><StatusEditor value={issue} kind={'list'} size={'small'} shouldShowLabel isEditable={false} /></div>
                {#if byPoints}<span class="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{issuePoints(issue) ?? '–'}</span>{/if}
              </div>
            {/each}
          {/if}
        </section>
      {/if}

      {#if report !== undefined && selected !== undefined}
        <section class="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="m-0 text-sm font-semibold"><Label label={str.CycleTime} /></h3>
            {#if cycles.length > 0}
              <span class="flex gap-3 text-xs text-muted-foreground">
                <span class="text-primary"><Label label={str.MedianDays} params={{ days: roundDays(cycleMedian) }} /></span>
                <span><Label label={str.P85Days} params={{ days: roundDays(cycleP85) }} /></span>
              </span>
            {/if}
          </div>
          <p class="m-0 text-xs text-muted-foreground"><Label label={str.CycleTimeHint} /></p>
          {#if cycles.length === 0}
            <p class="m-0 text-xs text-muted-foreground"><Label label={str.NoCycleTime} /></p>
          {:else}
            <CycleTimeChart items={cycleItems} median={cycleMedian} p85={cycleP85} from={report.start} to={report.end} />
          {/if}
        </section>
      {/if}

      <section class="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="m-0 text-sm font-semibold"><Label label={str.Velocity} /></h3>
          {#if velocityEntries.length > 0}
            <span class="text-xs text-muted-foreground">
              <Label label={str.AverageVelocity} params={{ count: averageVelocity }} /> ·
              <Label label={str.LastClosedSprints} params={{ count: velocityEntries.length }} />
            </span>
          {/if}
        </div>
        {#if velocityEntries.length === 0}
          <p class="text-xs text-muted-foreground"><Label label={str.NoClosedSprints} /></p>
        {:else}
          <VelocityChart entries={velocityEntries} />
        {/if}
      </section>
    </div>
  </Scroller>
{/if}
