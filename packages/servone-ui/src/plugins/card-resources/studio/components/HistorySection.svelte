<script lang="ts">
  import { listChanges, type ChangeFilter, type ChangeRecord } from '@servone/config'
  import * as Tabs from '../../../../lib/components/ui/tabs'
  import type { StudioContext } from '../extensions'
  import { text } from '../strings'
  import ChangeList from './ChangeList.svelte'
  import PanelClose from './PanelClose.svelte'

  export let studio: StudioContext
  export let revision: number
  export let onClose: (() => void) | undefined = undefined

  const PENDING = 'pending'
  const ALL = 'all'

  let shown = PENDING
  let changes: ChangeRecord[] = []
  let loadingFor = ''

  $: void load(shown, revision)

  async function load (filterId: string, at: number): Promise<void> {
    const token = `${filterId}:${at}`
    loadingFor = token
    const filter: ChangeFilter = {}
    if (filterId === PENDING) filter.status = 'pending'
    const found = await listChanges(studio.session, filter)
    if (loadingFor === token) changes = found
  }
</script>

<div class="history" data-id="studio-history-section">
  <header class="history-head">
    <div class="flex items-center justify-between gap-2">
      <h2 class="m-0 text-base font-semibold">{text('ChangeHistory')}</h2>
      {#if onClose !== undefined}<PanelClose {onClose} />{/if}
    </div>
    <p class="history-caption">{text('HistoryHelp')}</p>
    <Tabs.Root
      class="mt-2"
      value={shown}
      onValueChange={(next) => {
        shown = next
      }}
    >
      <Tabs.List>
        <Tabs.Trigger value={PENDING} data-id="studio-history-pending">{text('FilterPending')}</Tabs.Trigger>
        <Tabs.Trigger value={ALL} data-id="studio-history-all">{text('FilterAll')}</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </header>
  <ChangeList {studio} {changes} />
</div>

<style>
  .history {
    display: grid;
    align-content: start;
    max-width: 56rem;
    text-align: left;
  }
  .history-head {
    display: grid;
    gap: 4px;
    padding: 16px 16px 12px;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .history-caption {
    margin: 0;
    color: var(--theme-halfcontent-color);
    font-size: 12px;
    line-height: 1.5;
  }
</style>
