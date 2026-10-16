<script lang="ts">
  import { PersonRefPresenter } from '@hcengineering/contact-resources'
  import type { Status } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import type { Issue } from '@hcengineering/tracker'
  import { deviceOptionsStore as deviceInfo, IconClose, Label, tooltip } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'
  import { loadHistories, statusKindOf, toPlanIssue } from '../data'
  import { sprintReport, type SprintReport } from '../lib/report'
  import { totals } from '../lib/totals'
  import type { Sprint, StatusKind } from '../lib/types'
  import { str } from '../plugin'
  import { issuePoints } from '../schema'
  import { openDoc } from '@hcengineering/view-resources'
  import { blockedStore } from '../blocked'
  import BlockedBadge from './BlockedBadge.svelte'
  import BurndownChart from './BurndownChart.svelte'

  export let sprint: Sprint
  export let issues: Issue[]
  export let statuses: Status[]
  export let byPoints: boolean

  const client = getClient()
  const dispatch = createEventDispatcher<{ close: undefined }>()
  const BAR: Record<StatusKind, string> = {
    unstarted: 'bg-muted-foreground/25',
    todo: 'bg-muted-foreground/40',
    active: 'bg-primary',
    done: 'bg-emerald-500',
    canceled: 'bg-muted-foreground/15'
  }

  $: work = issues.filter((it) => !toPlanIssue(client, it).isEpic)
  $: t = totals(work.map((it) => toPlanIssue(client, it)))
  const size = (it: Issue): number => (byPoints ? issuePoints(it) ?? 0 : 1)
  $: total = Math.max(1, work.reduce((s, it) => s + size(it), 0))
  $: byStatus = statuses
    .map((st) => {
      const list = work.filter((it) => it.status === st._id)
      return { st, kind: statusKindOf(client, st._id), count: list.length, value: list.reduce((s, it) => s + size(it), 0) }
    })
    .filter((r) => r.count > 0)
  $: people = [...new Set(work.map((it) => it.assignee ?? ''))]
    .map((a) => {
      const mine = work.filter((it) => (it.assignee ?? '') === a)
      const sum = (kind: (k: StatusKind) => boolean): number =>
        mine.filter((it) => kind(statusKindOf(client, it.status))).reduce((s, it) => s + size(it), 0)
      return { a, open: sum((k) => k !== 'done' && k !== 'canceled'), done: sum((k) => k === 'done') }
    })
    .sort((x, y) => y.open + y.done - (x.open + x.done))

  $: blocked = work.filter((it) => $blockedStore.blockedBy.has(it._id))

  let report: SprintReport | undefined
  let requestId = 0
  $: key = work.map((it) => `${it._id}:${it.status}:${issuePoints(it)}`).join('|')
  $: void load(key)
  async function load (_key: string): Promise<void> {
    const id = ++requestId
    const histories = await loadHistories(client, issues)
    if (id !== requestId) return
    report = sprintReport(sprint, histories, byPoints, Date.now())
  }
  $: addedValue =
    report === undefined
      ? 0
      : report.added
        .map((id) => work.find((it) => it._id === id))
        .reduce((s, it) => s + (it !== undefined ? size(it) : 0), 0)
</script>

<aside
  class="flex shrink-0 flex-col gap-5 overflow-y-auto border-l p-4 text-sm *:shrink-0 {$deviceInfo.isMobile
    ? 'absolute inset-0 z-10 bg-background'
    : 'w-80'}"
>
  <section class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground"><Label label={str.ByStatus} /></h3>
      <button
        type="button"
        class="flex rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        use:tooltip={{ label: str.HideOverview }}
        on:click={() => dispatch('close')}><IconClose size={'small'} /></button
      >
    </div>
    <div class="flex h-2 overflow-hidden rounded-full bg-foreground/10">
      {#each byStatus as r (r.st._id)}
        <div class={BAR[r.kind]} style:width="{(r.value / total) * 100}%" title={r.st.name}></div>
      {/each}
    </div>
    <ul class="m-0 flex list-none flex-col gap-1 p-0">
      {#each byStatus as r (r.st._id)}
        <li class="flex items-center gap-2">
          <span class="size-2 rounded-full {BAR[r.kind]}"></span>
          <span class="flex-1">{r.st.name}</span>
          <span class="tabular-nums text-muted-foreground">{r.count}</span>
          {#if byPoints}<span class="w-12 text-right tabular-nums"><Label label={str.PointsShort} params={{ count: r.value }} /></span>{/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="grid grid-cols-2 gap-2">
    <div class="rounded-lg border px-3 py-2">
      <div class="text-lg font-semibold tabular-nums">{byPoints ? `${t.donePoints}/${t.points}` : `${t.doneCount}/${t.count}`}</div>
      <div class="text-xs text-muted-foreground"><Label label={str.Completed} /></div>
    </div>
    <div class="rounded-lg border px-3 py-2">
      <div class="text-lg font-semibold tabular-nums">
        {#if report !== undefined}+{byPoints ? addedValue : report.added.length}{:else}…{/if}
      </div>
      <div class="text-xs text-muted-foreground"><Label label={str.AddedAfterStart} /></div>
    </div>
  </section>

  {#if blocked.length > 0}
    <section class="flex flex-col gap-2">
      <h3 class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-red-500">
        <Label label={str.BlockedIssues} /><span class="tabular-nums">{blocked.length}</span>
      </h3>
      <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
        {#each blocked as it (it._id)}
          <li>
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent"
              on:click={() => openDoc(client.getHierarchy(), it)}
            >
              <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{it.identifier}</span>
              <span class="min-w-0 flex-1 truncate text-foreground">{it.title}</span>
              <BlockedBadge issueId={it._id} blocking={false} />
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="flex flex-col gap-2">
    <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground"><Label label={str.Burndown} /></h3>
    {#if report !== undefined}
      <!-- w-80 minus p-4 padding -->
      <BurndownChart points={report.burndown} width={288} height={180} />
    {:else}
      <Skeleton class="h-32" />
    {/if}
  </section>

  <section class="flex flex-col gap-2">
    <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground"><Label label={str.Assignee} /></h3>
    <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
      {#each people as p (p.a)}
        <li class="flex items-center gap-2">
          <div class="min-w-0 flex-1 truncate">
            {#if p.a === ''}<span class="text-muted-foreground"><Label label={str.Unassigned} /></span>{:else}<PersonRefPresenter value={p.a} />{/if}
          </div>
          <div class="flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-foreground/10">
            <div class="bg-emerald-500" style:width="{(p.done / Math.max(1, p.open + p.done)) * 100}%"></div>
          </div>
          <span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{p.done}/{p.open + p.done}</span>
        </li>
      {/each}
    </ul>
  </section>
</aside>
