<!-- A release is a label in the Releases category (see ../releases). -->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import tags, { type TagElement, type TagReference } from '@hcengineering/tags'
  import tracker, { type Issue, type Project } from '@hcengineering/tracker'
  import {
    Breadcrumbs,
    Button,
    Header,
    IconAdd,
    IconMoreH,
    Label,
    Loading,
    Scroller,
    SelectPopup,
    showPopup,
    Switcher,
    themeStore,
    tooltip,
    type TabItem
  } from '@hcengineering/ui'
  import { onMount } from 'svelte'
  import { statusKindOf } from '../data'
  import { icon, str } from '../plugin'
  import {
    deleteRelease,
    ensureReleaseSchema,
    RELEASE_CATEGORY,
    setReleaseState,
    toRelease,
    type Release,
    type ReleaseState
  } from '../releases'
  import { RELEASE } from '../scrum-spec'
  import { fmtDate } from '../ui'
  import ReleaseActionDialog from './ReleaseActionDialog.svelte'
  import ReleaseDialog from './ReleaseDialog.svelte'
  import IssuesView from '../../components/issues/IssuesView.svelte'

  export let currentSpace: Ref<Project>

  const client = getClient()

  let releaseOptionsLabel = ''
  $: void translate(str.ReleaseOptions, {}, $themeStore.language).then((v) => (releaseOptionsLabel = v))

  onMount(() => {
    void ensureReleaseSchema(client).catch(() => {})
  })

  let project: Project | undefined
  let releases: Release[] = []
  let refs: TagReference[] = []
  let issues: Issue[] = []
  let loaded = false

  const projectQuery = createQuery()
  const releaseQuery = createQuery()
  const refQuery = createQuery()
  const issueQuery = createQuery()
  $: projectQuery.query(tracker.class.Project, { _id: currentSpace }, (res) => (project = res[0]))
  $: releaseQuery.query(tags.class.TagElement, { category: RELEASE_CATEGORY, [RELEASE.project]: currentSpace } as any, (res) => {
    releases = res.map(toRelease).sort(byDate)
    loaded = true
  })
  $: ids = releases.map((r) => r.doc._id)
  $: refQuery.query(tags.class.TagReference, { tag: { $in: ids } }, (res) => (refs = res))
  $: issueQuery.query(tracker.class.Issue, { space: currentSpace }, (res) => (issues = res), {
    projection: { _id: 1, status: 1, space: 1 }
  })

  /** Unreleased first by release date (undated last), as Jira orders versions. */
  function byDate (a: Release, b: Release): number {
    return (a.releaseDate ?? Infinity) - (b.releaseDate ?? Infinity) || a.name.localeCompare(b.name)
  }

  $: kindById = new Map(issues.map((it) => [it._id as string, statusKindOf(client, it.status)]))
  interface Progress { todo: number, active: number, done: number, total: number }
  function progressOf (id: string, refs: TagReference[], kindById: Map<string, string>): Progress {
    const p = { todo: 0, active: 0, done: 0, total: 0 }
    for (const r of refs) {
      if (r.tag !== id) continue
      const k = kindById.get(r.attachedTo)
      if (k === undefined || k === 'canceled') continue
      p.total++
      if (k === 'done') p.done++
      else if (k === 'active') p.active++
      else p.todo++
    }
    return p
  }
  $: progress = new Map(releases.map((r) => [r.doc._id as string, progressOf(r.doc._id, refs, kindById)]))

  let tab: ReleaseState = 'unreleased'
  const tabs: TabItem[] = [
    { id: 'unreleased', labelIntl: str.Unreleased },
    { id: 'released', labelIntl: str.Released },
    { id: 'archived', labelIntl: str.Archived }
  ]
  $: shown = releases.filter((r) => r.state === tab)

  let selected: Ref<TagElement> | undefined
  $: open = releases.find((r) => r.doc._id === selected)
  $: openRefs = open === undefined ? [] : refs.filter((r) => r.tag === open?.doc._id)
  $: openQuery = { space: currentSpace, _id: { $in: openRefs.map((r) => r.attachedTo) } } as any

  function create (): void {
    if (project !== undefined) showPopup(ReleaseDialog, { project }, 'top')
  }
  function edit (r: Release): void {
    if (project !== undefined) showPopup(ReleaseDialog, { project, release: r.doc }, 'top')
  }
  function release (r: Release): void {
    const mine = refs.filter((x) => x.tag === r.doc._id)
    const openIds = new Set(mine.map((x) => x.attachedTo).filter((id) => {
      const k = kindById.get(id)
      return k !== 'done' && k !== 'canceled'
    }))
    const others = releases.filter((o) => o.state === 'unreleased' && o.doc._id !== r.doc._id).map((o) => o.doc)
    showPopup(ReleaseActionDialog, { release: r.doc, refs: mine, openIds, others }, 'top')
  }
  function remove (r: Release): void {
    showPopup(
      MessageBox,
      {
        label: str.DeleteRelease,
        message: str.DeleteReleaseConfirm,
        params: { name: r.name, count: progress.get(r.doc._id)?.total ?? 0 },
        dangerous: true
      },
      'top',
      async (ok?: boolean) => {
        if (ok !== true) return
        if (selected === r.doc._id) selected = undefined
        await deleteRelease(client, r.doc)
      }
    )
  }
  function menu (r: Release, anchor: HTMLElement): void {
    const value = [
      { id: 'edit', label: str.EditRelease },
      ...(r.state === 'unreleased' ? [{ id: 'release', label: str.ReleaseAction }] : []),
      ...(r.state === 'released' ? [{ id: 'unrelease', label: str.Unrelease }] : []),
      ...(r.state !== 'archived' ? [{ id: 'archive', label: str.Archive }] : [{ id: 'unarchive', label: str.Unarchive }]),
      { id: 'delete', label: str.DeleteRelease }
    ]
    showPopup(SelectPopup, { value }, anchor, async (id?: string) => {
      if (id === 'edit') edit(r)
      else if (id === 'release') release(r)
      else if (id === 'unrelease' || id === 'unarchive') await setReleaseState(client, r.doc, 'unreleased')
      else if (id === 'archive') await setReleaseState(client, r.doc, 'archived')
      else if (id === 'delete') remove(r)
    })
  }

  const STATE_LOOK: Record<ReleaseState, string> = {
    unreleased: 'bg-muted text-muted-foreground',
    released: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    archived: 'bg-muted text-muted-foreground'
  }
  const STATE_LABEL: Record<ReleaseState, typeof str.Released> = {
    unreleased: str.Unreleased,
    released: str.Released,
    archived: str.Archived
  }
  const overdue = (r: Release): boolean => r.state === 'unreleased' && r.releaseDate !== undefined && r.releaseDate < Date.now() - 86400000
  const pct = (n: number, p: Progress | undefined): string => `${p === undefined || p.total === 0 ? 0 : (n / p.total) * 100}%`
</script>

{#if open !== undefined}
  {@const r = open}
  {@const p = progress.get(r.doc._id)}
  <IssuesView query={openQuery} space={currentSpace} icon={icon.release} label={r.name}>
    <svelte:fragment slot="actions">
      <Button kind={'ghost'} size={'small'} label={str.BackToReleases} on:click={() => (selected = undefined)} />
      {#if r.state === 'unreleased'}
        <Button kind={'primary'} size={'small'} label={str.ReleaseAction} on:click={() => release(r)} />
      {/if}
      <Button kind={'regular'} size={'small'} icon={IconMoreH} on:click={(e) => menu(r, e.currentTarget)} />
    </svelte:fragment>
    <svelte:fragment slot="afterHeader">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground">
        <span class="rounded px-1.5 py-0.5 text-[11px] font-medium uppercase {STATE_LOOK[r.state]}"><Label label={STATE_LABEL[r.state]} /></span>
        {#if r.startDate !== undefined || r.releaseDate !== undefined}
          <span>{fmtDate(r.startDate)} – <span class={overdue(r) ? 'text-destructive' : ''}>{fmtDate(r.releaseDate)}</span></span>
        {/if}
        {#if p !== undefined}
          <span class="flex items-center gap-2">
            <span class="flex h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <span class="bg-emerald-500" style:width={pct(p.done, p)}></span>
              <span class="bg-primary" style:width={pct(p.active, p)}></span>
            </span>
            <Label label={str.IssuesDone} params={{ done: p.done, total: p.total }} />
          </span>
        {/if}
        {#if r.description}<span class="min-w-0 flex-1 truncate" title={r.description}>{r.description}</span>{/if}
      </div>
    </svelte:fragment>
  </IssuesView>
{:else}
  <Header adaptive={'disabled'}>
    <Breadcrumbs items={[{ icon: icon.release, label: str.Releases }]} />
    <svelte:fragment slot="extra">
      <Switcher name={'release-state'} items={tabs} selected={tab} kind={'subtle'} on:select={(e) => (tab = e.detail.id)} />
    </svelte:fragment>
    <svelte:fragment slot="actions">
      {#if project !== undefined}
        <Button track={'tracker.release_create.open'} icon={IconAdd} kind={'primary'} size={'small'} label={str.CreateRelease} on:click={create} />
      {/if}
    </svelte:fragment>
  </Header>

  {#if project === undefined || !loaded}
    <Loading />
  {:else if shown.length === 0}
    <div class="mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center text-sm">
      <div class="font-semibold"><Label label={str.NoReleases} /></div>
      <p class="text-muted-foreground"><Label label={str.NoReleasesHint} /></p>
      {#if tab === 'unreleased'}<Button track={'tracker.release_create.open'} kind={'primary'} size={'small'} label={str.CreateRelease} on:click={create} />{/if}
    </div>
  {:else}
    <Scroller>
      <div class="p-4">
        <div class="overflow-hidden rounded-lg border">
          <div
            class="grid h-9 grid-cols-[minmax(10rem,1.2fr)_7rem_minmax(8rem,1fr)_6rem_6rem_minmax(8rem,1.5fr)_2rem] items-center gap-3 border-b px-3 text-xs font-medium text-muted-foreground"
            style:background="color-mix(in oklch, var(--muted) 60%, var(--background))"
          >
            <span class="truncate"><Label label={str.Version} /></span>
            <span class="truncate"><Label label={str.Status} /></span>
            <span class="truncate"><Label label={str.Progress} /></span>
            <span class="truncate"><Label label={str.StartDate} /></span>
            <span class="truncate"><Label label={str.ReleaseDate} /></span>
            <span class="truncate"><Label label={str.Description} /></span>
            <span></span>
          </div>
          {#each shown as r (r.doc._id)}
            {@const p = progress.get(r.doc._id)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div
              class="grid h-10 cursor-pointer grid-cols-[minmax(10rem,1.2fr)_7rem_minmax(8rem,1fr)_6rem_6rem_minmax(8rem,1.5fr)_2rem] items-center gap-3 border-b px-3 text-sm last:border-b-0 hover:bg-muted/50"
              on:click={() => (selected = r.doc._id)}
            >
              <span class="truncate font-medium">{r.name}</span>
              <span><span class="rounded px-1.5 py-0.5 text-[11px] font-medium uppercase {STATE_LOOK[r.state]}"><Label label={STATE_LABEL[r.state]} /></span></span>
              <span
                class="flex h-1.5 overflow-hidden rounded-full bg-muted"
                use:tooltip={{ label: str.IssuesDone, props: { done: p?.done ?? 0, total: p?.total ?? 0 } }}
              >
                <span class="bg-emerald-500" style:width={pct(p?.done ?? 0, p)}></span>
                <span class="bg-primary" style:width={pct(p?.active ?? 0, p)}></span>
              </span>
              <span class="text-xs tabular-nums text-muted-foreground">{fmtDate(r.startDate)}</span>
              <span class="text-xs tabular-nums {overdue(r) ? 'text-destructive' : 'text-muted-foreground'}">{fmtDate(r.releaseDate)}</span>
              <span class="truncate text-xs text-muted-foreground" title={r.description}>{r.description}</span>
              <button
                type="button"
                class="flex rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={releaseOptionsLabel}
                use:tooltip={{ label: str.ReleaseOptions }}
                on:click|stopPropagation={(e) => menu(r, e.currentTarget)}
              >
                <IconMoreH size={'small'} />
              </button>
            </div>
          {/each}
        </div>
      </div>
    </Scroller>
  {/if}
{/if}
