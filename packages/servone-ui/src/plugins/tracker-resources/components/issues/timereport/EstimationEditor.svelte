<script lang="ts">
  import type { AttachedData } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { taskTypeStore } from '@hcengineering/task-resources'
  import type { Issue, IssueDraft } from '@hcengineering/tracker'
  import { Button, type ButtonKind, type ButtonSize, eventToHTMLElement, showPopup } from '@hcengineering/ui'
  import { EditBoxPopup, FixedColumn } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'
  import tracker from '../../../plugin'
  import { isWorkflowKind } from '../workflowItem'
  import EstimationPopup from './EstimationPopup.svelte'
  import EstimationStatsPresenter from './EstimationStatsPresenter.svelte'
  import TimePresenter from './TimePresenter.svelte'

  export let value: Issue | AttachedData<Issue> | IssueDraft
  export let isEditable: boolean = true
  export let kind: ButtonKind = 'link'
  export let size: ButtonSize = 'large'
  export let justify: 'left' | 'center' = 'left'
  export let width: string | undefined = undefined
  export let focusIndex: number | undefined = undefined

  const client = getClient()
  const dispatch = createEventDispatcher()

  $: isSavedIssue = value !== undefined && '_class' in value
  $: isHidden = !value || isWorkflowKind(value.kind, $taskTypeStore)
  $: currentEstimation = value?.estimation
  $: showAsListColumn = kind === 'list' && isSavedIssue

  function applyEstimation (nextEstimation: number | null | undefined): void {
    if (!isEditable || nextEstimation === undefined) return
    const normalizedEstimation = nextEstimation ?? 0
    if (normalizedEstimation === currentEstimation) return
    dispatch('change', normalizedEstimation)
    if ('_class' in value) {
      void client.update(value, { estimation: normalizedEstimation })
    } else {
      value.estimation = normalizedEstimation
    }
  }

  function openEditor (event: MouseEvent): void {
    event.stopPropagation()
    if (!isEditable) return
    if (kind === 'list') {
      showPopup(EstimationPopup, { value: currentEstimation, format: 'number', object: value }, 'top')
      return
    }
    showPopup(
      EditBoxPopup,
      { value: currentEstimation, format: 'number' },
      eventToHTMLElement(event),
      applyEstimation
    )
  }
</script>

{#if !isHidden}
  {#if showAsListColumn}
    <FixedColumn key={'estimation-editor-total'}>
      <EstimationStatsPresenter {value} {kind} on:click={openEditor} />
    </FixedColumn>
  {:else}
    <Button
      {focusIndex}
      showTooltip={isEditable ? { label: tracker.string.Estimation } : undefined}
      notSelected={currentEstimation === 0}
      icon={tracker.icon.DueDate}
      {justify}
      {width}
      {size}
      {kind}
      disabled={!isEditable}
      on:click={openEditor}
    >
      <svelte:fragment slot="content">
        <TimePresenter value={currentEstimation} />
      </svelte:fragment>
    </Button>
  {/if}
{/if}
