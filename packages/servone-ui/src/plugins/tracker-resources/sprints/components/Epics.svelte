<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tracker, { type Issue, type Project } from '@hcengineering/tracker'
  import {
    Breadcrumbs,
    Button,
    getCurrentLocation,
    Header,
    IconAdd,
    IconCollapseArrow,
    Label,
    Loading,
    location,
    navigate,
    Scroller,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import AssigneeEditor from '../../components/issues/AssigneeEditor.svelte'
  import IssuePresenter from '../../components/issues/IssuePresenter.svelte'
  import StatusEditor from '../../components/issues/StatusEditor.svelte'
  import CreateIssue from '../../components/CreateIssue.svelte'
  import { projectStatuses, toPlanIssue } from '../data'
  import { epicProgress } from '../lib/totals'
  import { icon, str } from '../plugin'
  import { projectSettings } from '../schema'
  import { isEpic, isScrumProject } from '../setup'
  import { byRank, fmtDate } from '../ui'
  import EpicDetail from './EpicDetail.svelte'
  import EpicIssueList from './EpicIssueList.svelte'
  import EpicProgressBar from './EpicProgressBar.svelte'
  import SetupPanel from './SetupPanel.svelte'

  export let currentSpace: Ref<Project>

  const client = getClient()
  let project: Project | undefined
  let issues: Issue[] = []
  let loaded = false

  const projectQuery = createQuery()
  const issueQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (res) => (project = res[0]))
  $: issueQuery.query(tracker.class.Issue, { space: currentSpace }, (res) => {
    issues = res
    loaded = true
  })

  $: settings = projectSettings(project)
  $: plan = issues.map((it) => toPlanIssue(client, it))
  $: epics = issues.filter(isEpic).sort(byRank)
  $: statuses = project !== undefined && isScrumProject(project) ? projectStatuses(client, project) : []
  $: statusOrder = statuses.map((st) => st._id as string)
  $: progress = new Map(epics.map((e) => [e._id as string, epicProgress(e._id, plan)]))

  $: openId = $location.query?.epic ?? undefined
  $: opened = openId !== undefined ? epics.find((e) => e._id === openId || e.identifier === openId) : undefined
  function openEpic (epic: Issue | undefined): void {
    const loc = getCurrentLocation()
    navigate({ ...loc, query: epic !== undefined ? { ...(loc.query ?? {}), epic: epic.identifier } : undefined })
  }

  let expanded = new Set<string>()
  function toggle (id: string): void {
    expanded.has(id) ? expanded.delete(id) : expanded.add(id)
    expanded = expanded
  }

  let showLabel = ''
  let hideLabel = ''
  $: void translate(str.ShowIssues, {}, $themeStore.language).then((v) => (showLabel = v))
  $: void translate(str.HideIssues, {}, $themeStore.language).then((v) => (hideLabel = v))
</script>

<Header adaptive={'disabled'}>
  {#if opened !== undefined}
    <Breadcrumbs
      items={[{ icon: icon.epics, label: str.Epics }, { title: `${opened.identifier} ${opened.title}` }]}
      selected={1}
      on:select={(e) => {
        if (e.detail === 0) openEpic(undefined)
      }}
    />
  {:else}
    <Breadcrumbs items={[{ icon: icon.epics, label: str.Epics }]} />
  {/if}
  <svelte:fragment slot="actions">
    {#if project !== undefined && isScrumProject(project) && opened === undefined}
      <Button
        icon={IconAdd}
        kind={'primary'}
        size={'small'}
        label={str.NewEpic}
        on:click={() => showPopup(CreateIssue, { space: currentSpace, shouldSaveDraft: false }, 'top')}
      />
    {/if}
  </svelte:fragment>
</Header>

{#if project === undefined || !loaded}
  <Loading />
{:else if !isScrumProject(project)}
  <SetupPanel {project} />
{:else if opened !== undefined}
  <Scroller>
    <EpicDetail
      {project}
      epic={opened}
      {issues}
      {epics}
      {statusOrder}
      progress={progress.get(opened._id) ?? epicProgress(opened._id, plan)}
      scale={settings.scale}
    />
  </Scroller>
{:else if epics.length === 0}
  <div class="mx-auto flex max-w-md flex-col items-center gap-1 p-10 text-center text-sm">
    <div class="font-semibold"><Label label={str.NoEpics} /></div>
    <p class="text-muted-foreground"><Label label={str.NoEpicsHint} /></p>
  </div>
{:else}
  <Scroller>
    <!-- Sizes match the tracker's List view: 36px header band, 40px rows, hover as the only row chrome. -->
    <div class="flex flex-col px-4 pb-4 pt-2 text-sm">
      <div class="flex h-9 items-center gap-3 rounded-lg px-3 text-xs text-muted-foreground" style:background="color-mix(in oklch, var(--muted) 60%, var(--background))">
        <span class="w-28 shrink-0 pl-5"><Label label={str.Epics} /> · {epics.length}</span>
        <span class="min-w-48 flex-1"></span>
        <span class="w-32 shrink-0"><Label label={str.Status} /></span>
        <span class="w-56 min-w-28"><Label label={str.Progress} /></span>
        <span class="w-20 min-w-14 truncate"><Label label={str.StartDate} /></span>
        <span class="w-20 min-w-14 truncate"><Label label={str.TargetDate} /></span>
        <span class="w-12 shrink-0 text-right"><Label label={str.Children} /></span>
        <span class="w-8 shrink-0"></span>
      </div>
      {#each epics as epic (epic._id)}
        {@const p = progress.get(epic._id) ?? epicProgress(epic._id, plan)}
        {@const open = expanded.has(epic._id)}
        <div class="flex h-10 items-center gap-3 rounded-md px-3 hover:bg-muted/50" style:background-color={open ? 'color-mix(in oklch, var(--muted) 50%, transparent)' : undefined}>
          <div class="flex w-28 shrink-0 items-center gap-1">
            <button
              type="button"
              class="-m-1.5 flex p-1.5 text-muted-foreground transition-transform disabled:opacity-30 {open ? 'rotate-90' : ''}"
              aria-label={open ? hideLabel : showLabel}
              aria-expanded={open}
              disabled={p.count === 0}
              on:click={() => toggle(epic._id)}
            >
              <IconCollapseArrow size={'small'} />
            </button>
            <IssuePresenter value={epic} shouldShowAvatar kind={'list'} />
          </div>
          <button
            type="button"
            class="block h-full min-w-48 flex-1 truncate text-foreground hover:underline"
            style:text-align="left"
            title={epic.title}
            on:click={() => openEpic(epic)}
          >
            {epic.title}
          </button>
          <div class="w-32 shrink-0"><StatusEditor value={epic} kind={'list'} size={'small'} shouldShowLabel /></div>
          <div class="flex w-56 min-w-28"><EpicProgressBar progress={p} scale={settings.scale} /></div>
          <span class="w-20 min-w-14 truncate whitespace-nowrap text-xs text-muted-foreground">{fmtDate(epic.startDate)}</span>
          <span class="w-20 min-w-14 truncate whitespace-nowrap text-xs text-muted-foreground">{fmtDate(epic.dueDate)}</span>
          <span class="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{p.count}</span>
          <div class="flex w-8 shrink-0 justify-end"><AssigneeEditor object={epic} kind={'list'} size={'small'} shouldShowName={false} /></div>
        </div>
        {#if open}
          <div class="pb-3 pl-8 pt-1">
            <div class="overflow-hidden rounded-lg border bg-background">
              <EpicIssueList {epic} {issues} {epics} {statusOrder} scale={settings.scale} />
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </Scroller>
{/if}
