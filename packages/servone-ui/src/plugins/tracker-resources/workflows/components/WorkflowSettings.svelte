<!-- The shared Tabbed settings page, headed by the workflow name. -->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { translate, type IntlString } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import type { Project } from '@hcengineering/tracker'
  import { Breadcrumb, Component, Header, themeStore } from '@hcengineering/ui'
  import { isWorkflowType, pageTitle, TABBED, workflowPagesProjectClass, type SettingsTab, type WorkflowPagesProject } from '../nav'
  import { workflowIcon } from '../plugin'

  export let currentSpace: Ref<Project> | undefined = undefined
  export let title: IntlString
  export let tabs: SettingsTab[]

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

  let pageLabel = ''
  $: void translate(title, {}, $themeStore.language).then((label) => {
    pageLabel = label
  })
</script>

{#if project !== undefined}
  <div class="flex h-full min-h-0 w-full flex-col">
    <Header adaptive={'disabled'}>
      <Breadcrumb icon={workflowIcon} title={pageTitle(project.name, pageLabel)} size={'large'} isCurrent />
    </Header>
    <div class="flex min-h-0 flex-1 flex-col">
      <Component is={TABBED} props={{ ...$$restProps, currentSpace, tabs }} />
    </div>
  </div>
{/if}
