<!-- Shaped like tracker's MyIssues, limited to workflow items. -->
<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { getCurrentAccount, type DocumentQuery, type Ref } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import tracker, { type Issue, type IssueStatus, type Project } from '@hcengineering/tracker'
  import { resolvedLocationStore, showPopup, type IModeSelector } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import IssuesView from '../../components/issues/IssuesView.svelte'
  import { emptyCopy } from '../../../../onboarding/empty-copy'
  import { isWorkflowType, UNARCHIVED } from '../nav'
  import { str, workflowIcon } from '../plugin'
  import CreateWorkflowDialog from './CreateWorkflowDialog.svelte'
  import EmptyState from './EmptyState.svelte'

  const dispatch = createEventDispatcher()
  const account = getCurrentAccount()
  const config: Array<[string, IntlString, object]> = [
    ['assigned', str.Assigned, {}],
    ['created', str.Created, {}]
  ]

  let projects: Array<Ref<Project>> = []
  let isProjectsLoaded = false
  const projectQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { members: account.uuid, archived: false }, (found) => {
    projects = found.filter((project) => isWorkflowType(project.type)).map((project) => project._id)
    isProjectsLoaded = true
  })

  let openStatuses: Array<Ref<IssueStatus>> = []
  const statusQuery = createQuery()
  $: statusQuery.query(tracker.class.IssueStatus, { category: { $in: [task.statusCategory.ToDo, task.statusCategory.Active] } }, (found) => {
    openStatuses = found.map((status) => status._id)
  })

  $: queries = new Map<string, DocumentQuery<Issue>>([
    ['assigned', { assignee: getCurrentEmployee(), status: { $in: openStatuses }, space: { $in: projects }, ...UNARCHIVED }],
    ['created', { createdBy: { $in: account.socialIds }, space: { $in: projects }, ...UNARCHIVED }]
  ])
  $: requested = $resolvedLocationStore.query?.mode ?? ''
  $: mode = queries.has(requested) ? requested : 'assigned'
  $: query = queries.get(mode)
  let modeSelectorProps: IModeSelector
  $: modeSelectorProps = { config, mode, onChange: (next: string) => dispatch('action', { mode: next }) }
</script>

{#if query !== undefined}
  <!-- CreateIssue lists every project when opened without one; starting on a workflow keeps its item wording.
     Grouping by workflow first keeps each workflow's own statuses together. -->
  <IssuesView {query} space={undefined} icon={workflowIcon} title={str.MyWork} {modeSelectorProps} createProps={{ space: projects[0] }}
    viewOptionDefaults={{ groupBy: ['space', 'status'], shouldShowAll: false }} />
  {#if isProjectsLoaded && projects.length === 0}
    <EmptyState label={emptyCopy.workflow} isNarrowed={false} actionLabel={emptyCopy.workflowAction} onAction={() => showPopup(CreateWorkflowDialog, {}, 'top')} />
  {:else}
    <EmptyState label={str.NothingAssigned} isNarrowed={mode !== 'assigned'} />
  {/if}
{/if}
