<script lang="ts">
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { Header } from '@hcengineering/ui'
  import { CHANGE_TYPE, describe, listChanges, type ChangeRecord, type ConfigSnapshot } from '@servone/config'
  import { CircleCheck, History, Plus, Sparkles } from '@lucide/svelte'
  import { onDestroy } from 'svelte'
  import { Button } from '../../../../../lib/components/ui/button'
  import { sendQuestion } from '../../assistant-chat'
  import AssistantPanel from '../../components/AssistantPanel.svelte'
  import CreateTypeDialog from '../../components/CreateTypeDialog.svelte'
  import DiffDialog from '../../components/DiffDialog.svelte'
  import HistorySection from '../../components/HistorySection.svelte'
  import PacksSection from '../../components/PacksSection.svelte'
  import type { ConfirmRequest } from '../../diff'
  import { SECTION_ID, type StudioContext } from '../../extensions'
  import { archivePhrase } from '../../header'
  import { lastUndoable } from '../../history'
  import { showPending, studioSession, typeDoc } from '../../huly'
  import type { SaveUi } from '../../save'
  import { text } from '../../strings'
  import { createStudioContext } from '../../studio-context'
  import { customerTypes, findType } from '../../type-list'
  import { dropPanel } from '../connect'
  import { runLayout } from '../elk'
  import type { Drop } from '../flow'
  import { shortcutOf } from '../keyboard'
  import { layoutGraph, type MapKind, type Point } from '../layout'
  import { companyGraph, formGraph, type Graph } from '../model'
  import { panelFor, type GraphPanel as Panel } from '../panel'
  import { graphOpenOf, type GraphRoute } from '../routes'
  import { focusGraph, FOCUS_THRESHOLD } from '../search'
  import FirstRun from './FirstRun.svelte'
  import GraphCanvas from './GraphCanvas.svelte'
  import GraphPanel from './GraphPanel.svelte'

  type Side = 'assistant' | 'history' | 'packs'

  const EDIT_MIN_WIDTH = 1024
  const RELOAD_DEBOUNCE_MS = 500
  const TOAST_MS = 8000
  const NO_PANEL: Panel = { kind: 'none' }
  const NO_MATCHES: ReadonlySet<string> = new Set()

  export let route: GraphRoute
  export let onGo: (next: GraphRoute) => void
  export let onOpenProcess: (tagId: string, processId: string) => void

  const session = studioSession()
  const canManage = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)

  let snapshot: ConfigSnapshot | undefined
  let pendingTypeKeys: ReadonlySet<string> = new Set()
  let pendingCount = 0
  let revision = 0
  let side: Side | undefined
  let panel: Panel = NO_PANEL
  let openedNodeId: string | undefined
  let newIds: ReadonlySet<string> = new Set()
  let isBlankOpen = false
  let focusId: string | undefined
  let selectedId: string | undefined
  let positions = new Map<string, Point>()
  let layoutRevision = 0
  let confirmRequest: ConfirmRequest | undefined
  let savedChange: ChangeRecord | undefined
  let lastChange: ChangeRecord | undefined
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let innerWidth = EDIT_MIN_WIDTH
  let reloadTimer: ReturnType<typeof setTimeout> | undefined

  async function reload (): Promise<void> {
    const [nextSnapshot, pending, applied] = await Promise.all([
      describe(session),
      listChanges(session, { status: 'pending' }),
      listChanges(session, { status: 'applied' })
    ])
    snapshot = nextSnapshot
    lastChange = lastUndoable(applied)
    pendingTypeKeys = new Set(pending.flatMap((it) => it.typeKeys))
    pendingCount = pending.length
    revision += 1
  }

  function hideToast (): void {
    savedChange = undefined
    if (toastTimer !== undefined) clearTimeout(toastTimer)
    toastTimer = undefined
  }

  const ui: SaveUi = {
    confirm: async (change, phrase) =>
      await new Promise<boolean>((resolve) => {
        const archiveName = snapshot !== undefined ? archivePhrase(change, snapshot) : undefined
        confirmRequest = { change, phrase: phrase ?? archiveName, resolve }
      }),
    applied: (change) => {
      hideToast()
      savedChange = change
      toastTimer = setTimeout(hideToast, TOAST_MS)
    },
    pending: showPending
  }

  const studio: StudioContext = createStudioContext({
    session,
    ui,
    reload,
    open: (next) => {
      const move = graphOpenOf(next)
      if (move.kind === 'route') onGo(move.route)
      else if (move.section === SECTION_ID.history) openSide('history')
      else if (move.section === SECTION_ID.packs) openSide('packs')
    }
  })

  async function undoSaved (change: ChangeRecord): Promise<void> {
    hideToast()
    await studio.undo(change.id)
  }

  const changes = createQuery()
  changes.query(CHANGE_TYPE, {}, () => {
    if (reloadTimer !== undefined) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      void reload()
    }, RELOAD_DEBOUNCE_MS)
  })

  onDestroy(() => {
    if (reloadTimer !== undefined) clearTimeout(reloadTimer)
    hideToast()
  })

  void reload()

  function mapKindOf (key: string | undefined): MapKind {
    return key === undefined ? 'company' : 'form'
  }

  $: isReadOnly = !canManage || innerWidth < EDIT_MIN_WIDTH
  $: typeKey = route.kind === 'form' ? route.typeKey : undefined
  $: mapKind = mapKindOf(typeKey)
  $: openType = snapshot === undefined || typeKey === undefined ? undefined : findType(snapshot, typeKey)
  $: isEmpty = snapshot !== undefined && typeKey === undefined && customerTypes(snapshot).length === 0
  $: fullGraph = snapshot === undefined ? undefined : typeKey === undefined ? companyGraph(snapshot, pendingTypeKeys) : formGraph(snapshot, typeKey, pendingTypeKeys)
  $: graph = fullGraph !== undefined && focusId !== undefined && typeKey === undefined ? focusGraph(fullGraph, focusId) : fullGraph
  $: void relayout(graph, mapKind)
  $: if (route.kind === 'form') selectedId = route.nodeId
  $: syncPanel(route, graph, snapshot)

  async function relayout (next: Graph | undefined, kind: MapKind): Promise<void> {
    if (next === undefined) return
    positions = await layoutGraph(next, kind, runLayout)
    layoutRevision += 1
  }

  function syncPanel (current: GraphRoute, shown: Graph | undefined, loaded: ConfigSnapshot | undefined): void {
    if (shown === undefined || loaded === undefined) return
    const nodeId = current.kind === 'form' ? current.nodeId : undefined
    if (nodeId === openedNodeId) return
    openedNodeId = nodeId
    const picked = nodeId === undefined ? undefined : shown.nodes.find((it) => it.id === nodeId)
    panel = picked === undefined || isReadOnly ? NO_PANEL : panelFor(loaded, current.kind === 'form' ? current.typeKey : undefined, picked.target)
    if (panel.kind !== 'none') side = undefined
  }

  function openPanel (next: Panel): void {
    panel = next
    if (next.kind !== 'none') side = undefined
  }

  function closePanel (): void {
    panel = NO_PANEL
    if (route.kind === 'form' && route.nodeId !== undefined) onGo({ kind: 'form', typeKey: route.typeKey, nodeId: undefined })
  }

  function openSide (next: Side): void {
    closePanel()
    side = next
  }

  function closeSide (): void {
    side = undefined
  }

  function toggleSide (next: Side): void {
    if (side === next) side = undefined
    else openSide(next)
  }

  function markNew (nodeId: string): void {
    newIds = new Set([...newIds, nodeId])
  }

  function openHulyProcess (processId: string): void {
    const tag = typeKey === undefined ? undefined : typeDoc(typeKey)
    if (tag !== undefined) onOpenProcess(tag._id, processId)
  }

  function select (nodeId: string): void {
    const picked = graph?.nodes.find((it) => it.id === nodeId)
    if (picked === undefined || snapshot === undefined) return
    selectedId = nodeId
    const target = picked.target
    if (target.kind === 'openForm') {
      focusId = undefined
      onGo({ kind: 'form', typeKey: target.typeKey, nodeId: undefined })
      return
    }
    if (target.kind === 'hulyProcess') {
      openHulyProcess(target.processId)
      return
    }
    if (isReadOnly) return
    if (typeKey === undefined) openPanel(panelFor(snapshot, undefined, target))
    else onGo({ kind: 'form', typeKey, nodeId })
  }

  function drop (sourceId: string, target: Drop): void {
    if (snapshot !== undefined && !isReadOnly) openPanel(dropPanel(snapshot, sourceId, target))
  }

  function askAssistant (story: string): void {
    openSide('assistant')
    void sendQuestion(story, undefined)
  }

  function isOverlayOpen (): boolean {
    return isBlankOpen || confirmRequest !== undefined || document.querySelector('.popup, [role="dialog"], [role="alertdialog"]') !== null
  }

  function stepBack (): void {
    if (panel.kind !== 'none') closePanel()
    else if (side !== undefined) closeSide()
  }

  function onKeydown (event: KeyboardEvent): void {
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]') !== null) return
    const shortcut = shortcutOf(event)
    const undoTarget = savedChange ?? lastChange
    if (shortcut === 'undo' && undoTarget !== undefined && !isReadOnly) {
      event.preventDefault()
      void undoSaved(undoTarget)
    }
    if (shortcut === 'back' && !isOverlayOpen()) {
      event.preventDefault()
      stepBack()
    }
    if (shortcut === 'fit') {
      event.preventDefault()
      layoutRevision += 1
    }
  }
</script>

<svelte:window bind:innerWidth onkeydown={onKeydown} />

<div class="graph-root flex h-full min-h-0 flex-col" data-id="servone-graph">
  <Header adaptive="disabled">
    <slot name="title" />
    {#if typeKey === undefined && !isReadOnly && !isEmpty}
      <Button
        size="sm"
        data-id="graph-add-type"
        onclick={() => {
          openPanel({ kind: 'createType' })
        }}><Plus size={16} />{text('GraphAddType')}</Button
      >
    {/if}
    <svelte:fragment slot="actions">
      <slot name="tools" />
      {#if typeKey === undefined && fullGraph !== undefined && fullGraph.nodes.length > FOCUS_THRESHOLD}
        <Button
          variant="ghost"
          size="sm"
          disabled={focusId === undefined && selectedId === undefined}
          onclick={() => {
            focusId = focusId === undefined ? selectedId : undefined
          }}>{text(focusId === undefined ? 'GraphFocus' : 'GraphShowAll')}</Button
        >
      {/if}
      <Button
        variant={side === 'history' ? 'secondary' : 'ghost'}
        size="sm"
        data-id="graph-history"
        onclick={() => {
          toggleSide('history')
        }}
      >
        <History size={16} />{text('GraphHistory')}
        {#if pendingCount > 0}
          <span class="graph-wait-chip" data-id="graph-pending-count">{text('GraphPendingCount', { count: pendingCount })}</span>
        {/if}
      </Button>
      <Button
        variant={side === 'assistant' ? 'secondary' : 'ghost'}
        size="sm"
        data-id="graph-assistant"
        onclick={() => {
          toggleSide('assistant')
        }}><Sparkles size={16} />{text('Assistant')}</Button
      >
    </svelte:fragment>
  </Header>
  {#if isReadOnly}
    <p class="m-0 border-b border-border px-4 py-2 text-sm text-muted-foreground" data-id="graph-read-only">
      {text(canManage ? 'GraphSmallScreen' : 'GraphReadOnly')}
    </p>
  {/if}
  {#if snapshot === undefined}
    <p class="m-0 p-6 text-sm text-muted-foreground">{text('Loading')}</p>
  {:else}
    <div class="flex min-h-0 flex-1">
      <main class="relative min-w-0 flex-1 overflow-y-auto">
        {#if isEmpty && isReadOnly}
          <p class="m-0 p-6 text-sm text-muted-foreground" data-id="graph-empty">{text('GraphEmptyReadOnly')}</p>
        {:else if isEmpty}
          <FirstRun
            {studio}
            onAskAssistant={askAssistant}
            onBlank={() => {
              isBlankOpen = true
            }}
          />
        {:else if graph === undefined}
          <div class="grid justify-items-start gap-3 p-6">
            <p class="m-0 text-sm text-muted-foreground">{text('GraphFormMissing')}</p>
            <Button
              variant="outline"
              onclick={() => {
                onGo({ kind: 'company' })
              }}>{text('GraphBack')}</Button
            >
          </div>
        {:else}
          {#key layoutRevision}
            <GraphCanvas
              {graph}
              {positions}
              matches={NO_MATCHES}
              {newIds}
              {selectedId}
              canEdit={!isReadOnly}
              isCompany={typeKey === undefined}
              onSelect={select}
              onDrop={drop}
              undoSummary={lastChange?.summary}
              onUndo={() => {
                if (lastChange !== undefined) void undoSaved(lastChange)
              }}
              onRelayout={() => {
                void relayout(graph, mapKind)
              }}
            />
          {/key}
        {/if}
        {#if savedChange !== undefined}
          {@const change = savedChange}
          <div class="graph-toast" role="status" data-id="graph-toast">
            <CircleCheck size={16} />
            <span>{text('GraphSaved')}</span>
            <button
              type="button"
              class="graph-toast-undo"
              data-id="studio-undo"
              onclick={() => {
                void undoSaved(change)
              }}>{text('Undo')}</button
            >
            <kbd class="graph-kbd">⌘Z</kbd>
          </div>
        {/if}
      </main>
      {#if panel.kind !== 'none'}
        <!-- A panel keeps its draft in local state; moving to another node must start a fresh one. -->
        {#key panel}
          <GraphPanel
            {studio}
            {snapshot}
            {panel}
            onClose={closePanel}
            onAdded={markNew}
            onOpenSide={(next) => {
              openSide(next)
            }}
          />
        {/key}
      {:else if side === 'assistant'}
        <aside class="flex min-h-0 w-[380px] shrink-0 flex-col border-l border-border" data-id="graph-side">
          <AssistantPanel {studio} {snapshot} {typeKey} onClose={closeSide} />
        </aside>
      {:else if side === 'history'}
        <aside class="w-[380px] shrink-0 overflow-y-auto border-l border-border" data-id="graph-side">
          <HistorySection {studio} {revision} onClose={closeSide} />
        </aside>
      {:else if side === 'packs'}
        <aside class="w-[380px] shrink-0 overflow-y-auto border-l border-border" data-id="graph-side">
          <PacksSection {studio} {snapshot} onClose={closeSide} />
        </aside>
      {/if}
    </div>
  {/if}
</div>

{#if isBlankOpen && snapshot !== undefined}
  <CreateTypeDialog
    {snapshot}
    {studio}
    onClose={() => {
      isBlankOpen = false
    }}
  />
{/if}

{#if confirmRequest !== undefined}
  <DiffDialog
    request={confirmRequest}
    onDone={() => {
      confirmRequest = undefined
    }}
  />
{/if}

<style>
  /* Svelte Flow's own light-grey defaults would ignore the Huly dark theme. */
  .graph-root {
    --xy-background-color: var(--theme-panel-color);
    --xy-edge-label-background-color: var(--theme-popup-color);
    --xy-edge-label-color: var(--theme-dark-color);
    --xy-minimap-background-color: var(--theme-popup-color);
  }
  .graph-wait-chip {
    display: inline-flex;
    align-items: center;
    height: 18px;
    margin-left: 4px;
    padding: 0 6px;
    border-radius: 9px;
    background: var(--theme-button-warning-bg);
    color: var(--theme-button-warning-color);
    font-size: 11px;
  }
  .graph-toast {
    position: absolute;
    top: 14px;
    left: 50%;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 40px;
    padding: 0 6px 0 14px;
    transform: translateX(-50%);
    border-radius: 10px;
    background: var(--theme-tooltip-bg);
    color: var(--theme-tooltip-color);
    box-shadow: var(--theme-popup-shadow);
    font-size: 13px;
  }
  .graph-toast-undo {
    height: 32px;
    padding: 0 10px;
    border-radius: 6px;
    color: var(--primary-button-default);
    font-weight: 600;
  }
  .graph-kbd {
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--theme-tooltip-key-bg);
    font-size: 11px;
  }
</style>
