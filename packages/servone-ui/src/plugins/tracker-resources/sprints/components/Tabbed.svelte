<!--
  Tab lives in the URL (`?tab=planning`) so links and reloads land on the same screen; other workbench props pass through.
-->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import tracker, { type Project } from '@hcengineering/tracker'
  import { Component, Switcher, deviceOptionsStore as deviceInfo, getCurrentLocation, location, navigate, type AnyComponent, type TabItem } from '@hcengineering/ui'
  import { ChevronLeft } from '@lucide/svelte'
  import { specialIds } from '../plugin'

  interface Tab {
    id: string
    label: IntlString
    component: AnyComponent
    componentProps?: Record<string, any>
  }

  export let tabs: Tab[]

  $: selectedId = tabs.some((t) => t.id === $location.query?.tab) ? ($location.query?.tab as string) : tabs[0]?.id
  $: selected = tabs.find((t) => t.id === selectedId)
  $: items = tabs.map((t) => ({ id: t.id, labelIntl: t.label })) as TabItem[]

  let project: Project | undefined
  const projectQuery = createQuery()
  $: isSprintPage = $location.path[4] === specialIds.sprint
  $: if (isSprintPage && $$restProps.currentSpace !== undefined) {
    projectQuery.query(tracker.class.Project, { _id: $$restProps.currentSpace }, (found) => (project = found[0]))
  }

  function backToIssues (): void {
    const loc = getCurrentLocation()
    loc.path[4] = 'issues'
    loc.path.length = 5
    navigate({ ...loc, query: {} })
  }

  function select (item: TabItem): void {
    const loc = getCurrentLocation()
    navigate({ ...loc, query: { ...loc.query, tab: item.id } })
  }
</script>

<div class="flex h-full min-h-0 w-full flex-col">
  {#if $deviceInfo.isMobile && isSprintPage}
    <div class="flex h-12 shrink-0 items-center gap-1 px-2">
      <button type="button" class="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground" aria-label={project?.name} on:click={backToIssues}>
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <span class="min-w-0 truncate text-base font-semibold">{project?.name ?? ''}</span>
    </div>
  {/if}
  <div class="servone-tabbed-bar no-scrollbar flex shrink-0 items-center overflow-x-auto border-b border-border px-3 py-2">
    <Switcher name={'servone-tabbed'} {items} selected={selectedId} kind={'subtle'} on:select={(e) => select(e.detail)} />
  </div>
  <div class="flex min-h-0 flex-1 flex-col">
    {#if selected !== undefined}
      {#key selected.id}
        <Component is={selected.component} props={{ ...$$restProps, ...selected.componentProps }} />
      {/key}
    {/if}
  </div>
</div>
