<script lang="ts">
  import core, { WorkspaceEvent, type Tx, type TxWorkspaceEvent, type WithLookup } from '@hcengineering/core'
  import { getResource, translate, translateCB, type IntlString } from '@hcengineering/platform'
  import {
    ActionContext,
    SearchResult,
    addTxListener,
    contextStore,
    createQuery,
    getClient,
    reduceCalls,
    removeTxListener,
    searchFor,
    type SearchItem
  } from '@hcengineering/presentation'
  import ui, {
    Button,
    Component,
    Icon,
    IconArrowLeft,
    Label,
    ListView,
    capitalizeFirstLetter,
    closePopup,
    formatKey,
    resizeObserver,
    themeStore
  } from '@hcengineering/ui'
  import type { Action, ViewContext } from '@hcengineering/view'
  import { createEventDispatcher, onMount, tick } from 'svelte'
  import { filterActions, getSelection, normalizeActionContext } from '../actions'
  import view from '../plugin'
  import { focusStore, selectionStore } from '../selection'
  import { openDoc } from '../utils'
  import ObjectPresenter from './ObjectPresenter.svelte'
  import ChevronDown from './icons/ChevronDown.svelte'
  import ChevronUp from './icons/ChevronUp.svelte'
  import { isPaletteAction, matchesQuery } from '../../../lib/palette'
  import { watchAppRail, type AppRail } from '../../workbench-resources/rail'
  import type { PaletteEntry } from '../../workbench-resources/palette/entries'
  import { paletteStr } from '../../workbench-resources/palette/strings'
  import { MAIL_TYPES } from '@servone/mail'

  type PaletteRow =
    | { kind: 'entry', entry: PaletteEntry, groupTitle: IntlString, isFirstInGroup: boolean }
    | { kind: 'search', item: SearchItem, groupTitle: IntlString, isFirstInGroup: boolean }
    | { kind: 'action', action: WithLookup<Action>, groupTitle: IntlString | undefined, isFirstInGroup: boolean }

  export let viewContext: ViewContext | undefined = $contextStore.getLastContext()

  const dispatch = createEventDispatcher<{ changeContent: undefined, change: string }>()
  const client = getClient()
  const SEARCH_DEBOUNCE_MS = 100
  const ENTRY_LIMIT_WHILE_SEARCHING = 3
  const appRail = watchAppRail()
  const hiddenHitClasses = new Set<string>(MAIL_TYPES)

  let inputElement: HTMLInputElement | undefined
  let listView: ListView | undefined
  let shouldAutoFocus = true
  let liveText = ''
  let committedText = ''
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let placeholderText = ''
  let selection = 0
  let subViewAction: WithLookup<Action> | undefined

  let queriedActions: WithLookup<Action>[] = []
  let availableActions: WithLookup<Action>[] = []
  let shownActions: WithLookup<Action>[] = []
  let allEntries: PaletteEntry[] = []
  let searchItems: SearchItem[] = []
  let pendingSearches = 0

  export function focus (): void {
    inputElement?.focus()
    shouldAutoFocus = false
  }

  function stripCommandPrefix (text: string): string {
    const trimmed = text.trim()
    return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  }

  function isServerSearch (text: string): boolean {
    const trimmed = text.trim()
    return trimmed !== '' && !trimmed.startsWith('/')
  }

  const actionQuery = createQuery()
  actionQuery.query(
    view.class.Action,
    {},
    (found) => {
      queriedActions = found
    },
    { lookup: { category: view.class.ActionCategory } }
  )

  const computeAvailable = reduceCalls(async (candidates: WithLookup<Action>[]): Promise<void> => {
    const actedOn = getSelection($focusStore, $selectionStore)
    let remaining = candidates.filter(
      (action) =>
        isPaletteAction(action) &&
        (action.$lookup?.category?.visible ?? true) &&
        (action.context.application === undefined || action.context.application === viewContext?.application)
    )
    for (const doc of actedOn) {
      remaining = filterActions(client, doc, remaining)
    }
    if (actedOn.length === 0) {
      remaining = remaining.filter((action) => action.input === 'none')
      const overriddenIds = new Set(remaining.flatMap((action) => action.override ?? []))
      remaining = remaining.filter((action) => !overriddenIds.has(action._id))
    }
    const testContext = normalizeActionContext(actedOn)
    const isVisible = await Promise.all(
      remaining.map(async (action) => {
        if (action.visibilityTester === undefined) return true
        const tester = await getResource(action.visibilityTester)
        return await tester(testContext)
      })
    )
    availableActions = remaining
      .filter((_action, index) => isVisible[index])
      .sort((first, second) => first.category.localeCompare(second.category))
  })

  const narrowByLabel = reduceCalls(
    async (actions: WithLookup<Action>[], text: string, language: string): Promise<void> => {
      const needle = stripCommandPrefix(text).toLowerCase()
      if (needle === '') {
        shownActions = actions
        return
      }
      const labels = await Promise.all(actions.map(async (action) => await translate(action.label, {}, language)))
      shownActions = actions.filter((_action, index) => labels[index].toLowerCase().includes(needle))
    }
  )

  const rebuildEntries = reduceCalls(async (rail: AppRail, language: string): Promise<void> => {
    const { buildEntries } = await import('../../workbench-resources/palette/entries')
    allEntries = await buildEntries(rail, language)
  })

  const runServerSearch = reduceCalls(async (text: string): Promise<void> => {
    pendingSearches += 1
    try {
      const hits = isServerSearch(text) ? (await searchFor('spotlight', text)).items : []
      searchItems = hits.filter((hit) => !hiddenHitClasses.has(hit.item.doc._class))
    } finally {
      pendingSearches -= 1
    }
  })

  function buildRows (
    entries: PaletteEntry[],
    hits: SearchItem[],
    actions: WithLookup<Action>[],
    isContentSearch: boolean
  ): PaletteRow[] {
    const keptEntries = isContentSearch ? entries.slice(0, ENTRY_LIMIT_WHILE_SEARCHING) : entries
    const entryRows = keptEntries.map(
      (entry, index): PaletteRow => ({
        kind: 'entry',
        entry,
        groupTitle: entry.group,
        isFirstInGroup: index === 0 || keptEntries[index - 1].group !== entry.group
      })
    )
    const searchRows = hits.map(
      (item, index): PaletteRow => ({
        kind: 'search',
        item,
        groupTitle: item.category.title,
        isFirstInGroup: index === 0 || hits[index - 1].category !== item.category
      })
    )
    const actionRows = actions.map((action, index): PaletteRow => {
      const groupTitle = action.$lookup?.category?.label
      const previousTitle = index === 0 ? undefined : actions[index - 1].$lookup?.category?.label
      return { kind: 'action', action, groupTitle, isFirstInGroup: groupTitle !== undefined && groupTitle !== previousTitle }
    })
    return isContentSearch
      ? [...searchRows, ...entryRows, ...actionRows]
      : [...entryRows, ...searchRows, ...actionRows]
  }

  function scheduleCommit (): void {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      committedText = liveText
      dispatch('change', committedText)
    }, SEARCH_DEBOUNCE_MS)
  }

  function onTransactions (txes: Tx[]): void {
    const hasIndexingUpdate = txes.some(
      (tx) =>
        tx._class === core.class.TxWorkspaceEvent && (tx as TxWorkspaceEvent).event === WorkspaceEvent.IndexingUpdate
    )
    if (hasIndexingUpdate) void runServerSearch(committedText)
  }

  async function runRow (index: number, trigger: Event): Promise<void> {
    const row = rows[index]
    if (row === undefined) return
    if (row.kind === 'entry') {
      closePopup()
      await row.entry.run()
      return
    }
    if (row.kind === 'search') {
      const hitDoc = await client.findOne(row.item.item.doc._class, { _id: row.item.item.doc._id })
      if (hitDoc !== undefined) await openDoc(client.getHierarchy(), hitDoc)
      return
    }
    const action = row.action
    if (action.actionPopup !== undefined) {
      subViewAction = action
      return
    }
    const actedOn = getSelection($focusStore, $selectionStore)
    const runAction = await getResource(action.action)
    closePopup()
    runAction(action.input === 'focus' ? actedOn[0] : actedOn, trigger, { ...action.actionProps, action })
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (subViewAction !== undefined) return
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.stopPropagation()
      event.preventDefault()
      listView?.select(event.code === 'ArrowUp' ? selection - 1 : selection + 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      void runRow(selection, event)
    }
  }

  async function leaveSubViewAndFocus (): Promise<void> {
    subViewAction = undefined
    await tick()
    focus()
  }

  onMount(() => {
    addTxListener(onTransactions)
    return () => {
      removeTxListener(onTransactions)
    }
  })

  $: void computeAvailable(queriedActions)
  $: void narrowByLabel(availableActions, liveText, $themeStore.language)
  $: if ($appRail.isLoaded) void rebuildEntries($appRail, $themeStore.language)
  $: void runServerSearch(committedText)
  $: entryQuery = stripCommandPrefix(liveText)
  $: shownEntries =
    entryQuery === ''
      ? allEntries.filter((entry) => !entry.isSearchOnly)
      : allEntries.filter((entry) =>
        matchesQuery(entryQuery, [entry.text, entry.hint ?? '', ...(entry.aliases ?? [])])
      )
  $: rows = buildRows(shownEntries, searchItems, shownActions, isServerSearch(liveText))
  $: translateCB(view.string.ActionPlaceholder, {}, $themeStore.language, (translated: string) => {
    placeholderText = translated
  })
  $: if (inputElement !== undefined && shouldAutoFocus) {
    inputElement.focus()
    shouldAutoFocus = false
  }
  $: hasSelectedDocs = $selectionStore.docs.length > 0
  $: focusedDoc = $focusStore.focus
  $: isSearching = pendingSearches > 0 || liveText !== committedText
  $: showStrip = hasSelectedDocs || focusedDoc !== undefined || subViewAction !== undefined
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="selectPopup width-40 max-h-[30rem]"
  use:resizeObserver={() => {
    dispatch('changeContent')
  }}
  on:keydown={handleKeydown}
>
  <ActionContext context={{ mode: 'none' }} />

  {#if showStrip}
    <div class="mx-5 mt-4 flex shrink-0 items-center">
      {#if hasSelectedDocs}
        <div class="inline-block rounded-sm bg-(--theme-popup-divider) px-2 py-1 text-foreground">
          <Label label={view.string.NumberItems} params={{ count: $selectionStore.docs.length }} />
        </div>
      {:else if focusedDoc !== undefined}
        <div class="inline-block rounded-sm bg-(--theme-popup-divider) px-2 py-1 text-foreground">
          <ObjectPresenter objectId={focusedDoc._id} _class={focusedDoc._class} value={focusedDoc} disabled />
        </div>
      {/if}
      {#if subViewAction !== undefined}
        <div class="mr-2 ml-auto">
          <Button
            icon={IconArrowLeft}
            label={ui.string.Back}
            kind={'ghost'}
            size={'small'}
            width={'fit-content'}
            on:click={() => {
              subViewAction = undefined
            }}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if subViewAction !== undefined}
    <Component
      is={subViewAction.actionPopup}
      props={{
        ...subViewAction.actionProps,
        value: getSelection($focusStore, $selectionStore),
        width: 'full',
        size: 'medium',
        embedded: true
      }}
      on:close={leaveSubViewAndFocus}
    />
  {:else}
    <div class="header pt-4! px-5! flex items-center gap-3">
      <input
        bind:this={inputElement}
        bind:value={liveText}
        class="actionsInput min-w-0 flex-1 rounded-sm border-none bg-transparent text-[18px] caret-(--theme-caret-color) outline-none placeholder:text-muted-foreground"
        type="text"
        placeholder={placeholderText}
        on:input={scheduleCommit}
        on:change={scheduleCommit}
        on:keydown
      />
      <button
        type="button"
        class="hidden min-h-11 shrink-0 items-center text-sm text-primary max-[480px]:inline-flex"
        on:click={() => { closePopup() }}
      >
        <Label label={ui.string.Cancel} />
      </button>
    </div>
    <div class="scroll">
      <div class="box">
        <ListView
          bind:this={listView}
          bind:selection
          count={rows.length}
          on:click={(event) => {
            void runRow(event.detail, event)
          }}
        >
          <svelte:fragment slot="category" let:item>
            {@const row = rows[item]}
            {#if row !== undefined && row.isFirstInGroup && row.groupTitle !== undefined}
              <div class="px-5 py-2 text-[10px] leading-4 tracking-[1px] text-muted-foreground uppercase">
                <Label label={row.groupTitle} />
              </div>
            {/if}
          </svelte:fragment>
          <svelte:fragment slot="item" let:item>
            {@const row = rows[item]}
            {#if row === undefined}
              <span></span>
            {:else if row.kind === 'entry'}
              <div
                class="mx-2 my-1 flex cursor-pointer items-center gap-4 p-1.5 text-sm {selection === item
                  ? 'text-foreground'
                  : 'text-foreground/80'}"
              >
                <span class={selection === item ? 'text-foreground' : 'text-muted-foreground'}>
                  <Icon icon={row.entry.icon ?? IconArrowLeft} size={'small'} />
                </span>
                <span class="flex-1 truncate">{row.entry.text}</span>
                {#if row.entry.hint}
                  <span class="mr-2 shrink-0 text-xs text-muted-foreground">{row.entry.hint}</span>
                {/if}
              </div>
            {:else if row.kind === 'search'}
              <div class="ap-menuItem withComp my-1 mx-1! h-9">
                <SearchResult value={row.item.item} />
              </div>
            {:else}
              <div
                class="mx-2 my-1 flex cursor-pointer items-center gap-4 p-1.5 text-sm {selection === item
                  ? 'text-foreground'
                  : 'text-foreground/80'}"
              >
                <span class={selection === item ? 'text-foreground' : 'text-muted-foreground'}>
                  <Icon icon={row.action.icon ?? IconArrowLeft} size={'small'} />
                </span>
                <span class="flex-1 truncate"><Label label={row.action.label} /></span>
                <div class="mr-2 flex shrink-0 items-center">
                  {#each row.action.keyBinding ?? [] as binding, bindingIndex}
                    {#if bindingIndex > 0}
                      <span class="mx-2 lowercase"><Label label={view.string.Or} /></span>
                    {/if}
                    {#each formatKey(binding) as chord, chordIndex}
                      {#if chordIndex > 0}
                        <span class="mx-1 lowercase"><Label label={view.string.Then} /></span>
                      {/if}
                      <div class="flex gap-2">
                        {#each chord as key}
                          <span
                            class="flex min-w-6 items-center justify-center rounded-sm border border-(--theme-button-border) bg-(--theme-button-default) px-2 text-xs text-foreground"
                          >
                            {capitalizeFirstLetter(key.trim())}
                          </span>
                        {/each}
                      </div>
                    {/each}
                  {/each}
                </div>
              </div>
            {/if}
          </svelte:fragment>
        </ListView>
        {#if isServerSearch(committedText)}
          <div class="px-5 py-3 text-[13px] text-muted-foreground" role="status">
            {#if isSearching}
              <Label label={paletteStr.Searching} />
            {:else if searchItems.length === 0}
              <Label label={paletteStr.NoResults} params={{ query: committedText.trim() }} />
            {/if}
          </div>
        {/if}
        <div class="h-2 shrink-0"></div>
      </div>
    </div>
    <div
      class="flex h-11 shrink-0 items-center border-t max-[480px]:hidden border-(--theme-popup-divider) px-5 text-[13px] text-muted-foreground"
    >
      <span class="m-0.5 flex size-4 items-center justify-center rounded-sm bg-muted text-xs">
        <ChevronUp size={'small'} />
      </span>
      <span class="m-0.5 flex size-4 items-center justify-center rounded-sm bg-muted text-xs">
        <ChevronDown size={'small'} />
      </span>
      <span class="mx-2.5"><Label label={view.string.Type} /></span>
      <span class="m-0.5 flex size-4 items-center justify-center rounded-sm bg-muted text-xs">/</span>
      <span class="ml-2.5"><Label label={view.string.ToViewCommands} /></span>
    </div>
  {/if}
</div>
