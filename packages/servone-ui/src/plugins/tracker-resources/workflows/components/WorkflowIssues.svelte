<!-- Tracker's Issues page plus a Quy trình empty state. -->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { getEmbeddedLabel, translate, type IntlString } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import tracker, { type Project } from '@hcengineering/tracker'
  import { Component, getCurrentLocation, location, navigate, resolvedLocationStore, showPopup, themeStore } from '@hcengineering/ui'
  import { ISSUES, isWorkflowType, pageTitle, shownPage, workflowPagesProjectClass, type WorkflowPagesProject } from '../nav'
  import { WORKFLOW_APP_ALIAS } from '../plugin'
  import EmptyState from './EmptyState.svelte'

  export let currentSpace: Ref<Project> | undefined = undefined
  export let title: IntlString
  export let config: Array<[string, IntlString, object]>
  export let emptyLabel: IntlString
  export let emptyActionLabel: IntlString | undefined = undefined

  let project: WorkflowPagesProject | undefined
  const projectQuery = createQuery()
  $: if (currentSpace === undefined) {
    projectQuery.unsubscribe()
    project = undefined
  } else {
    projectQuery.query(workflowPagesProjectClass, { _id: currentSpace }, (found) => {
      project = found.find((candidate) => isWorkflowType(candidate.type))
    })
  }

  $: page = $location.path[2] === WORKFLOW_APP_ALIAS && $location.path[3] === project?._id ? $location.path[4] : undefined
  $: target = project === undefined || page === undefined ? page : shownPage(page, project)
  $: if (target !== page && target !== undefined) {
    const loc = getCurrentLocation()
    loc.path[4] = target
    navigate(loc, true)
  }

  let pageLabel = ''
  $: void translate(title, {}, $themeStore.language).then((label) => {
    pageLabel = label
  })

  $: mode = $resolvedLocationStore.query?.mode
  $: isNarrowed = config.some(([id], index) => index > 0 && id === mode)

  function newItem (): void {
    showPopup(tracker.component.CreateIssue, { space: currentSpace, shouldSaveDraft: false }, 'top')
  }
</script>

{#if project !== undefined && target === page}
  <Component
    is={ISSUES}
    props={{ ...$$restProps, currentSpace, config, title: getEmbeddedLabel(pageTitle(project.name, pageLabel)) }}
    on:action
  />
  <EmptyState label={emptyLabel} {isNarrowed} actionLabel={emptyActionLabel} onAction={newItem} />
{/if}
