<script lang="ts">
  import { Card, getClient } from '@hcengineering/presentation'
  import type { TagElement, TagReference } from '@hcengineering/tags'
  import ui, { DatePresenter, DropdownLabels, Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { str } from '../plugin'
  import { moveOpenIssues, setReleaseState } from '../releases'
  import { startOfDay } from '../ui'

  export let release: TagElement
  /** The release's issue links, and which of those issues are still open. */
  export let refs: TagReference[]
  export let openIds: Set<string>
  export let others: TagElement[]

  const dispatch = createEventDispatcher()
  const client = getClient()
  const KEEP = '__keep'

  let at: number | null = Date.now()
  $: openCount = refs.filter((r) => openIds.has(r.attachedTo)).length
  $: items = [{ id: KEEP, label: '' }, ...others.map((o) => ({ id: o._id, label: o.title }))]
  let target: string = KEEP

  async function save (): Promise<void> {
    const to = others.find((o) => o._id === target)
    if (openCount > 0 && to !== undefined) await moveOpenIssues(client, refs, openIds, to)
    await setReleaseState(client, release, 'released', startOfDay(at ?? Date.now()))
  }
</script>

<Card
  label={str.ReleaseTitle}
  labelProps={{ name: release.title }}
  okLabel={str.ReleaseAction}
  okAction={save}
  canSave={at != null}
  width={'small'}
  gap={'gapV-4'}
  on:close={() => dispatch('close')}
>
  {#if openCount > 0}
    <div class="flex flex-col gap-2 text-sm">
      <span class="text-amber-600 dark:text-amber-400"><Label label={str.OpenIssuesLeft} params={{ count: openCount }} /></span>
      {#if others.length > 0}
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground"><Label label={str.MoveOpenTo} /></span>
          <DropdownLabels
            items={items.map((it) => (it.id === KEEP ? { ...it, label: '—' } : it))}
            bind:selected={target}
            kind={'regular'}
            size={'medium'}
            enableSearch={false}
          />
        </div>
        {#if target === KEEP}
          <span class="text-xs text-muted-foreground"><Label label={str.KeepInRelease} /></span>
        {/if}
      {/if}
    </div>
  {/if}
  <svelte:fragment slot="pool">
    <DatePresenter bind:value={at} editable label={str.ReleaseDate} detail={ui.string.SelectDate} kind={'regular'} size={'large'} />
  </svelte:fragment>
</Card>
