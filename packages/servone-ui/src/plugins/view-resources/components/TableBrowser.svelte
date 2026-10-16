<script lang="ts">
  import type { Class, Doc, DocumentQuery, FindOptions, Ref } from '@hcengineering/core'
  import core, { generateId, SortingOrder } from '@hcengineering/core'
  import { ActionContext, createQuery, getClient } from '@hcengineering/presentation'
  import { deviceOptionsStore as deviceInfo, type FadeOptions, Scroller, tableSP } from '@hcengineering/ui'
  import type { BuildModelKey, ViewOptionModel, ViewOptions, Viewlet } from '@hcengineering/view'
  import { onDestroy, onMount } from 'svelte'
  import EmptyState from '../../../components/EmptyState.svelte'
  import { useEmptyState } from '../../../lib/empty-state'
  import { focusStore, ListSelectionProvider, type SelectDirection } from '../selection'
  import type { LoadingProps } from '../utils'
  import { type ViewletContext, ViewletContextStore, viewletContextStore } from '../viewletContextStore'
  import { setViewOptions } from '../viewOptions'
  import Table from './Table.svelte'

  export let _class: Ref<Class<Doc>>
  export let query: DocumentQuery<Doc>
  export let totalQuery: DocumentQuery<Doc> | undefined = undefined
  export let showNotification: boolean = false
  export let options: FindOptions<Doc> | undefined = undefined
  export let baseMenuClass: Ref<Class<Doc>> | undefined = undefined
  export let config: Array<BuildModelKey | string>
  export let enableChecking: boolean = true
  export let tableId: string | undefined = undefined
  export let fade: FadeOptions = tableSP
  export let prefferedSorting: string = 'modifiedOn'
  export let viewOptions: ViewOptions | undefined = undefined
  export let viewOptionsConfig: ViewOptionModel[] | undefined = undefined
  export let viewlet: Viewlet | undefined = undefined
  export let readonly: boolean = false
  export let loadingProps: LoadingProps | undefined = undefined

  let tableComponent: Table | undefined

  function navigateRows (offset: 1 | -1 | 0, of?: Doc, direction?: SelectDirection, noScroll?: boolean): void {
    if (direction !== 'vertical') return
    tableComponent?.select(offset, of, noScroll)
  }

  const selectionProvider = new ListSelectionProvider(navigateRows)
  const checkedStore = selectionProvider.selection
  const emptyStateContext = useEmptyState()
  const contextId = generateId()
  const countQuery = createQuery()

  $: checkedDocs = $checkedStore ?? []
  $: focusedIndex = selectionProvider.current($focusStore)

  onMount(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })

  function onSort (event: CustomEvent<{ key: string, order: SortingOrder }>): void {
    if (viewlet === undefined || viewOptions === undefined) return
    viewOptions.orderBy = [event.detail.key, event.detail.order]
    setViewOptions(viewlet, viewOptions)
  }

  function onCheck (event: CustomEvent<{ docs: Doc[], value: boolean }>): void {
    selectionProvider.updateSelection(event.detail.docs, event.detail.value)
  }

  function publishViewletContext (
    currentViewlet: Viewlet | undefined,
    currentConfig: Array<BuildModelKey | string>,
    currentQuery: DocumentQuery<Doc>,
    currentViewOptions: ViewOptions | undefined,
    currentClass: Ref<Class<Doc>>
  ): void {
    const context: ViewletContext = {
      id: contextId,
      viewlet: currentViewlet,
      config: currentConfig,
      query: currentQuery,
      viewOptions: currentViewOptions,
      _class: currentClass
    }
    const knownContexts = $viewletContextStore.contexts
    const knownPosition = knownContexts.findIndex((known) => known.id === contextId)
    const nextContexts =
      knownPosition === -1
        ? [...knownContexts, context]
        : knownContexts.map((known, position) => (position === knownPosition ? context : known))
    viewletContextStore.set(new ViewletContextStore(nextContexts))
  }

  $: publishViewletContext(viewlet, config, query, viewOptions, _class)

  onDestroy(() => {
    const knownContexts = $viewletContextStore.contexts
    const knownPosition = knownContexts.findIndex((known) => known.id === contextId)
    if (knownPosition === -1) return
    viewletContextStore.set(new ViewletContextStore(knownContexts.slice(0, knownPosition)))
  })

  $: countedQuery = totalQuery ?? query
  $: countedQueryKey = JSON.stringify(countedQuery)
  $: countIdentity = `${_class}:${countedQueryKey}`

  let documentCount = 0
  let arrivedIdentity: string | undefined

  function requestDocumentCount (requestClass: Ref<Class<Doc>>, requestIdentity: string): void {
    countQuery.query(
      requestClass,
      countedQuery,
      (countResult) => {
        documentCount = Math.max(countResult.total, 0)
        arrivedIdentity = requestIdentity
      },
      { limit: 1, total: true }
    )
  }

  $: if (emptyStateContext !== undefined) requestDocumentCount(_class, countIdentity)

  $: hasCountArrived = arrivedIdentity === countIdentity
  $: isEmptyStateVisible =
    emptyStateContext !== undefined && hasCountArrived && documentCount === 0 && !$emptyStateContext?.filtered
  $: resolvedViewOptionsConfig = viewOptionsConfig ?? viewlet?.viewOptions?.other
  $: isPhoneSpaceList = $deviceInfo.isMobile && getClient().getHierarchy().isDerived(_class, core.class.Space)
  $: shownConfig = isPhoneSpaceList ? config.slice(0, 1) : config
</script>

<ActionContext context={{ mode: 'browser' }} />
<Scroller {fade} horizontal>
  <Table
    bind:this={tableComponent}
    {_class}
    config={shownConfig}
    {options}
    {query}
    {totalQuery}
    {showNotification}
    {baseMenuClass}
    {loadingProps}
    highlightRows={true}
    {enableChecking}
    showFooter={!isEmptyStateVisible && !$deviceInfo.isMobile}
    hiddenHeader={isEmptyStateVisible}
    checked={checkedDocs}
    selection={focusedIndex}
    {prefferedSorting}
    {tableId}
    {viewOptions}
    viewOptionsConfig={resolvedViewOptionsConfig}
    {readonly}
    on:row-focus={(event) => {
      selectionProvider.updateFocus(event.detail)
    }}
    on:content={(event) => {
      selectionProvider.update(event.detail)
    }}
    on:sort={onSort}
    on:check={onCheck}
  />
  {#if isEmptyStateVisible && $emptyStateContext !== undefined}
    <EmptyState
      icon={$emptyStateContext.icon}
      iconProps={$emptyStateContext.iconProps}
      label={$emptyStateContext.label}
      hint={$emptyStateContext.hasCreate && $emptyStateContext.copy === undefined}
      title={$emptyStateContext.copy?.message}
      actions={$emptyStateContext.copy?.actions}
    />
  {/if}
</Scroller>
