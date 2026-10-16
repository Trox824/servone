<!--
  Mounted by view-resources/components/ganttViewlet.ts for the Gantt viewlet. Outside a project there are
  no single project's sprints and epics to lay out, so it falls back to the tracker's Gantt.
-->
<script lang="ts">
  import type { DocumentQuery, Ref } from '@hcengineering/core'
  import type { Issue, Project } from '@hcengineering/tracker'
  import { Component } from '@hcengineering/ui'
  import Timeline from './Timeline.svelte'

  export let space: Ref<Project> | undefined = undefined
  export let query: DocumentQuery<Issue> | undefined = undefined
</script>

{#if space !== undefined}
  <Timeline currentSpace={space} embedded filterQuery={query} />
{:else}
  <Component is={'tracker:component:GanttView'} props={{ ...$$props }} />
{/if}
