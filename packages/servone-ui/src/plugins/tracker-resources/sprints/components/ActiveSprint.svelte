<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import type { DocumentQuery, Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tracker, { type Issue, type Milestone, type Project } from '@hcengineering/tracker'
  import { Button, getCurrentLocation, Label, Loading, navigate, showPopup, tooltip, type IModeSelector } from '@hcengineering/ui'
  import type { Viewlet } from '@hcengineering/view'
  import { makeViewletKey, setActiveViewletId } from '@hcengineering/view-resources'
  import { copyIdOf } from '@servone/config'
  import { onMount } from 'svelte'
  import { blockedIds } from '../blocked'
  import { projectStatuses, toPlanIssue } from '../data'
  import { totals } from '../lib/totals'
  import { icon, specialIds, str } from '../plugin'
  import { issuePoints, projectSettings, toSprint } from '../schema'
  import { isEpic, isScrumProject, TASK_TYPE } from '../setup'
  import { daysLeft, fmtRange } from '../ui'
  import CompleteSprintDialog from './CompleteSprintDialog.svelte'
  import SetupPanel from './SetupPanel.svelte'
  import SprintOverview from './SprintOverview.svelte'
  import IssuesView from '../../components/issues/IssuesView.svelte'

  export let currentSpace: Ref<Project>

  const client = getClient()
  const me = getCurrentEmployee()
  /** The tracker's board viewlet (models/tracker viewlets.ts). */
  const BOARD_VIEWLET = 'tracker:viewlet:IssueKanban' as Ref<Viewlet>

  onMount(() => {
    try {
      const saved = localStorage.getItem(makeViewletKey())
      if (saved === null || !saved.startsWith('tracker:viewlet:Issue')) setActiveViewletId(BOARD_VIEWLET)
    } catch {}
  })

  let project: Project | undefined
  let issues: Issue[] = []
  let milestones: Milestone[] = []
  let loaded = false

  const projectQuery = createQuery()
  const issueQuery = createQuery()
  const milestoneQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (res) => (project = res[0]))
  $: milestoneQuery.query(tracker.class.Milestone, { space: currentSpace }, (res) => (milestones = res))
  $: issueQuery.query(tracker.class.Issue, { space: currentSpace }, (res) => {
    issues = res
    loaded = true
  })

  const OVERVIEW_KEY = 'servone.sprint.overview'
  let overview = readOverview()
  function readOverview (): boolean {
    try {
      return localStorage.getItem(OVERVIEW_KEY) !== 'closed'
    } catch {
      return true
    }
  }
  $: try {
    localStorage.setItem(OVERVIEW_KEY, overview ? 'open' : 'closed')
  } catch {}

  $: settings = projectSettings(project)
  $: active = milestones
    .filter((m) => toSprint(m).state === 'active')
    .sort((a, b) => (a.startDate ?? a.targetDate) - (b.startDate ?? b.targetDate))[0]
  $: sprint = active !== undefined ? toSprint(active) : undefined
  $: inSprint = active === undefined ? [] : issues.filter((it) => it.milestone === active?._id)
  $: work = inSprint.filter((it) => !isEpic(it))
  $: statuses = project !== undefined ? projectStatuses(client, project) : []
  $: t = totals(inSprint.map((it) => toPlanIssue(client, it)))

  type Mode = 'all' | 'mine' | 'unpointed' | 'blocked'
  let mode: Mode = 'all'
  $: modes = [
    ['all', str.All, {}],
    ['mine', str.OnlyMyIssues, {}],
    ...(settings.scale !== 'off' ? [['unpointed', str.OnlyUnpointed, {}]] : []),
    ['blocked', str.OnlyBlocked, {}]
  ] as IModeSelector['config']
  let modeSelectorProps: IModeSelector
  $: modeSelectorProps = { config: modes, mode, onChange: (m: string) => (mode = m as Mode) }
  $: query = sprintQuery(currentSpace, active, mode, work, $blockedIds)
  function sprintQuery (
    space: Ref<Project>,
    m: Milestone | undefined,
    md: Mode,
    list: Issue[],
    blocked: Set<string>
  ): DocumentQuery<Issue> {
    const q: DocumentQuery<Issue> = { space, milestone: m?._id, kind: { $nin: [TASK_TYPE.epic, copyIdOf(TASK_TYPE.epic, space)] } }
    if (md === 'mine') q.assignee = me as any
    if (md === 'unpointed') q._id = { $in: list.filter((it) => issuePoints(it) === null).map((it) => it._id) }
    if (md === 'blocked') q._id = { $in: list.filter((it) => blocked.has(it._id)).map((it) => it._id) }
    return q
  }

  function goBacklog (): void {
    const loc = getCurrentLocation()
    loc.path[4] = specialIds.sprint
    loc.path.length = 5
    navigate({ ...loc, query: { tab: 'planning' } })
  }

  $: left = sprint !== undefined ? daysLeft(sprint.targetDate) : 0
</script>

{#if project === undefined || !loaded}
  <Loading />
{:else if !isScrumProject(project)}
  <SetupPanel {project} />
{:else if active === undefined || sprint === undefined}
  <div class="mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center text-sm">
    <div class="font-semibold"><Label label={str.NoActiveSprint} /></div>
    <p class="text-muted-foreground"><Label label={str.NoActiveSprintHint} /></p>
    <Button kind={'primary'} size={'small'} label={str.GoToBacklog} on:click={goBacklog} />
  </div>
{:else}
  <div class="relative flex min-h-0 min-w-0 flex-1">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <IssuesView
        {query}
        space={currentSpace}
        icon={icon.sprint}
        label={active.label}
        {modeSelectorProps}
        createProps={{ milestone: active._id }}
      >
        <svelte:fragment slot="actions">
          <Button
            kind={overview ? 'regular' : 'ghost'}
            size={'small'}
            label={str.Overview}
            selected={overview}
            on:click={() => (overview = !overview)}
          />
          <Button
            kind={'regular'}
            size={'small'}
            label={str.CompleteSprint}
            on:click={() => showPopup(CompleteSprintDialog, { sprint: active, milestones, issues: inSprint, project }, 'top')}
          />
        </svelte:fragment>
        <svelte:fragment slot="afterHeader">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground">
            <span>{fmtRange(sprint.startDate, sprint.targetDate)}</span>
            <span class={left < 0 ? 'text-destructive' : ''}>
              {#if left < 0}<Label label={str.Overdue} />{:else}<Label label={str.DaysLeft} params={{ count: left }} />{/if}
            </span>
            {#if settings.scale !== 'off'}
              <span
                class="tabular-nums text-foreground"
                use:tooltip={{ label: str.PointsDone, props: { done: t.donePoints, total: t.points } }}
              >
                <Label label={str.PointsOf} params={{ done: t.donePoints, total: t.points }} />
              </span>
            {:else}
              <span class="tabular-nums text-foreground">
                <Label label={str.IssuesDone} params={{ done: t.doneCount, total: t.count }} />
              </span>
            {/if}
            {#if sprint.goal}
              <span class="min-w-0 flex-1 truncate" title={sprint.goal}>{sprint.goal}</span>
            {/if}
          </div>
        </svelte:fragment>
      </IssuesView>
    </div>
    {#if overview}
      <SprintOverview {sprint} issues={inSprint} {statuses} byPoints={settings.scale !== 'off'} on:close={() => (overview = false)} />
    {/if}
  </div>
{/if}
