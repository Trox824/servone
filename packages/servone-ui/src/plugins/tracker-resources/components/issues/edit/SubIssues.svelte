<script lang="ts">
  import { taskTypeStore } from '@hcengineering/task-resources'
  import { type Issue, trackerId } from '@hcengineering/tracker'
  import { Button, IconScaleFull, Label, closeTooltip, getCurrentResolvedLocation, navigate, showPopup } from '@hcengineering/ui'
  import { createFilter, restrictionStore, setFilters } from '@hcengineering/view-resources'
  import tracker from '../../../plugin'
  import LinkSubIssueActionPopup from '../../LinkSubIssueActionPopup.svelte'
  import HierarchyAddPopup from '../HierarchyAddPopup.svelte'
  import QueryIssuesList from './QueryIssuesList.svelte'
  import { str } from '../../../sprints/plugin'
  import { isWorkflowKind } from '../workflowItem'

  export let issue: Issue
  export let shouldSaveDraft: boolean = false
  export let focusIndex: number = -1

  let childCount = issue.subIssues

  $: isWorkflowItem = isWorkflowKind(issue.kind, $taskTypeStore)

  function trackChildCount (event: CustomEvent<unknown[]>): void {
    childCount = event.detail.length
  }

  function chooseAddMode (): void {
    showPopup(HierarchyAddPopup, { direction: 'sub' }, 'top', (choice?: 'create' | 'link') => {
      if (choice === 'link') {
        showPopup(LinkSubIssueActionPopup, { value: issue }, 'top')
      } else if (choice === 'create') {
        showPopup(tracker.component.CreateIssue, { space: issue.space, parentIssue: issue, shouldSaveDraft }, 'top')
      }
    })
  }

  function openChildrenInList (): void {
    const childFilter = createFilter(tracker.class.Issue, 'attachedTo', [issue._id])
    if (childFilter === undefined) return
    closeTooltip()
    const listLocation = getCurrentResolvedLocation()
    listLocation.fragment = undefined
    listLocation.query = undefined
    listLocation.path[2] = trackerId
    listLocation.path[3] = issue.space
    listLocation.path[4] = 'issues'
    navigate(listLocation)
    setFilters([childFilter])
  }
</script>

<QueryIssuesList
  object={issue}
  query={{ attachedTo: issue._id }}
  createParams={{ space: issue.space, parentIssue: issue }}
  createLabel={isWorkflowItem ? str.AddSubItem : tracker.string.AddSubIssues}
  customAddAction={chooseAddMode}
  hasSubIssues={issue.subIssues > 0}
  {focusIndex}
  {shouldSaveDraft}
  on:docs={trackChildCount}
>
  <svelte:fragment slot="chevron">
    <Label
      label={isWorkflowItem ? str.SubItemsList : tracker.string.SubIssuesList}
      params={{ subIssues: childCount }}
    />
  </svelte:fragment>
  <svelte:fragment slot="buttons">
    {#if !$restrictionStore.disableNavigation && !isWorkflowItem}
      <Button
        icon={IconScaleFull}
        kind={'ghost'}
        disabled={childCount === 0}
        showTooltip={{ label: tracker.string.OpenSubIssues, direction: 'bottom' }}
        on:click={openChildrenInList}
      />
    {/if}
  </svelte:fragment>
</QueryIssuesList>
