<script lang="ts">
  import {
    type AggregateValue,
    type AttachedDoc,
    type Class,
    type Doc,
    type DocumentQuery,
    type DocumentUpdate,
    type FindOptions,
    Hierarchy,
    type Lookup,
    type PrimitiveType,
    type RateLimiter,
    type Ref,
    type Space
  } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { type DocWithRank, makeRank } from '@hcengineering/task'
  import ui, {
    type AnyComponent,
    type AnySvelteComponent,
    ExpandCollapse,
    mouseAttractor,
    Loading,
    Label,
    Scroller
  } from '@hcengineering/ui'
  import type { AttributeModel, BuildModelKey, ViewOptionModel, ViewOptions, Viewlet } from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'
  import { fade } from 'svelte/transition'
  import { showMenu } from '../../actions'
  import { type SelectionFocusProvider, focusStore } from '../../selection'
  import ListHeader from './ListHeader.svelte'
  import ListItem from './ListItem.svelte'

  export let category: PrimitiveType | AggregateValue
  export let headerComponent: AttributeModel | undefined
  export let singleCat: boolean
  export let oneCat: boolean
  export let lastCat: boolean
  export let groupByKey: string
  export let space: Ref<Space> | undefined
  export let baseMenuClass: Ref<Class<Doc>> | undefined
  export let itemProj: Doc[]
  export let docKeys: Partial<DocumentQuery<Doc>> = {}
  export let createItemDialog: AnyComponent | AnySvelteComponent | undefined
  export let createItemDialogProps: Record<string, unknown> | undefined
  export let createItemLabel: IntlString | undefined
  export let createItemEvent: string | undefined
  export let selectedObjectIds: Doc[]
  export let itemModels: Map<Ref<Class<Doc>>, AttributeModel[]>
  export let extraHeaders: AnyComponent[] | undefined
  export let flatHeaders: boolean = false
  export let disableHeader: boolean = false
  export let props: Record<string, unknown> = {}
  export let level: number
  export let lookup: Lookup<Doc>
  export let _class: Ref<Class<Doc>>
  export let config: Array<string | BuildModelKey>
  export let configurations: Record<Ref<Class<Doc>>, Viewlet['config']> | undefined
  export let configurationsVersion: number
  export let viewOptions: ViewOptions
  export let newObjectProps: (doc: Doc | undefined) => Record<string, unknown> | undefined
  export let viewOptionsConfig: ViewOptionModel[] | undefined = undefined
  export let dragItem: { doc?: Doc, revert?: () => void }
  export let listDiv: HTMLDivElement
  export let groupPersistKey: string
  export let compactMode: boolean = false
  export let resultQuery: DocumentQuery<Doc>
  export let resultOptions: FindOptions<Doc>
  export let parentCategories: number = 0
  export let limiter: RateLimiter
  export let listProvider: SelectionFocusProvider
  export let singleCategoryLimit: number = 50
  export let readonly: boolean = false

  const DEEPEST_PAGE_SIZE = 20
  const SHOW_MORE_STEP = 50
  const UNLIMITED_QUERY_LIMIT = 200
  const ID_QUERY_MAX_DOCS = 20
  const EDGE_TOLERANCE_PX = 5
  const SCROLL_RETRY_DELAY_MS = 50

  const dispatch = createEventDispatcher()
  const client = getClient()
  const groupQuery = createQuery()

  let rootElement: HTMLDivElement
  let isCollapsed = true
  let hasMountedRows = false
  let isLoading = false
  let loadedDocs: Doc[] = []
  let orderedDocs: Doc[] = []
  let depthByDocId = new Map<Ref<Doc>, number>()
  let parentDocIds = new Set<Ref<Doc>>()
  let foldedParentIds = new Set<Ref<Doc>>()
  let dragPosition: number | undefined
  let currentLimit: number | undefined
  let pointedDoc: Doc | undefined
  const rowComponents: Record<string, InstanceType<typeof ListItem> | undefined> = {}

  const focusPointedDoc = mouseAttractor(() => {
    if (pointedDoc !== undefined) dispatch('row-focus', pointedDoc)
  })

  $: isDeepest = level + 1 >= viewOptions.groupBy.length
  $: pageSize = isDeepest ? (singleCat ? singleCategoryLimit : DEEPEST_PAGE_SIZE) : undefined
  $: currentLimit = pageSize
  $: selectionStore = $focusStore.provider?.selection
  $: providerSelection = $selectionStore ?? []
  $: if (currentLimit !== undefined) widenLimitForChecked(itemProj, providerSelection)

  $: isRankOrdering = viewOptions.orderBy?.[0] === 'rank'
  $: storageKey = `list_collapsing_${location.pathname}_${groupPersistKey}`
  $: isCollapsed = resolveInitialCollapsed(storageKey, singleCat, isDeepest, level)

  $: runGroupQuery(isDeepest, _class, resultQuery, resultOptions, docKeys, itemProj, currentLimit)

  $: renderedRows = currentLimit === undefined ? orderedDocs : orderedDocs.slice(0, currentLimit)
  $: displayedCount = renderedRows.length + (loadedDocs.length - orderedDocs.length)
  $: hasAnyParent = parentDocIds.size > 0
  $: isDragInGroup = dragPosition !== undefined
  $: areRowsVisible = itemModels.size > 0 && (!isCollapsed || hasMountedRows || isDragInGroup)

  function widenLimitForChecked (projected: Doc[], selection: Doc[]): void {
    if (currentLimit === undefined || projected.length === 0 || selection.length === 0) return
    const groupDocIds = new Set(projected.map((doc) => doc._id))
    const checkedCount = selection.filter((doc) => groupDocIds.has(doc._id)).length
    if (checkedCount > currentLimit) currentLimit += checkedCount
  }

  function resolveInitialCollapsed (key: string, isSingle: boolean, deepest: boolean, depth: number): boolean {
    const stored = localStorage.getItem(key)
    if (stored !== null) return !isSingle && stored === 'true'
    const threshold = deepest ? DEEPEST_PAGE_SIZE : singleCategoryLimit
    const hasTooManyItems = !disableHeader && !isSingle && itemProj.length > threshold / (depth + 1)
    return hasTooManyItems || parentCategories > 10 || (depth > 1 && parentCategories > 5)
  }

  function parentIdOf (doc: Doc): Ref<Doc> | undefined {
    return (doc as Partial<AttachedDoc>).attachedTo
  }

  function rebuildOrder (docs: Doc[], foldedIds: Set<Ref<Doc>>): void {
    const docsById = new Map(docs.map((doc) => [doc._id, doc]))
    const childrenByParentId = new Map<Ref<Doc>, Doc[]>()
    const topLevelDocs: Doc[] = []
    for (const doc of docs) {
      const parentId = parentIdOf(doc)
      if (parentId !== undefined && parentId !== doc._id && docsById.has(parentId)) {
        const siblings = childrenByParentId.get(parentId) ?? []
        siblings.push(doc)
        childrenByParentId.set(parentId, siblings)
      } else {
        topLevelDocs.push(doc)
      }
    }

    const sequence: Doc[] = []
    const depths = new Map<Ref<Doc>, number>()
    const hiddenIds = new Set<Ref<Doc>>()

    const hideDescendants = (doc: Doc): void => {
      for (const child of childrenByParentId.get(doc._id) ?? []) {
        if (hiddenIds.has(child._id)) continue
        hiddenIds.add(child._id)
        hideDescendants(child)
      }
    }

    const visit = (doc: Doc, depth: number): void => {
      if (depths.has(doc._id) || hiddenIds.has(doc._id)) return
      depths.set(doc._id, depth)
      sequence.push(doc)
      if (foldedIds.has(doc._id)) {
        hideDescendants(doc)
        return
      }
      for (const child of childrenByParentId.get(doc._id) ?? []) visit(child, depth + 1)
    }

    for (const doc of topLevelDocs) visit(doc, 0)
    for (const doc of docs) visit(doc, 0)

    orderedDocs = sequence
    depthByDocId = depths
    parentDocIds = new Set(childrenByParentId.keys())
  }

  function runGroupQuery (
    deepest: boolean,
    targetClass: Ref<Class<Doc>>,
    baseQuery: DocumentQuery<Doc>,
    baseOptions: FindOptions<Doc>,
    selectorKeys: Partial<DocumentQuery<Doc>>,
    projectedDocs: Doc[],
    limit: number | undefined
  ): void {
    if (!deepest) {
      groupQuery.unsubscribe()
      return
    }
    let query = baseQuery
    if (projectedDocs.length < ID_QUERY_MAX_DOCS && baseQuery.$search !== null) {
      query = { ...baseQuery }
      delete query.$search
      query._id = { $in: projectedDocs.map((doc) => doc._id) }
    }
    const mergedQuery = { ...query, ...selectorKeys }
    const mergedOptions = { ...baseOptions, limit: limit ?? UNLIMITED_QUERY_LIMIT }
    void limiter.add(async () => {
      try {
        const hasStartedRequest = groupQuery.query(
          targetClass,
          mergedQuery,
          (docs) => {
            loadedDocs = docs
            rebuildOrder(docs, foldedParentIds)
            isLoading = false
            const focused = $focusStore.focus
            if (focused !== undefined) {
              const freshCopy = orderedDocs.find((doc) => doc._id === focused._id)
              if (freshCopy !== undefined) dispatch('row-focus', freshCopy)
            }
          },
          mergedOptions
        )
        if (hasStartedRequest) isLoading = true
      } catch (err) {
        console.error(err)
        isLoading = false
      }
    })
  }

  function toggleFold (parent: Doc): void {
    const nextFolded = new Set(foldedParentIds)
    if (!nextFolded.delete(parent._id)) nextFolded.add(parent._id)
    foldedParentIds = nextFolded
    rebuildOrder(loadedDocs, nextFolded)
  }

  function isAggregate (candidate: PrimitiveType | AggregateValue): candidate is AggregateValue {
    return typeof candidate === 'object' && candidate !== null
  }

  function buildGroupProps (doc: Doc | undefined): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...newObjectProps(doc) }
    if (doc !== undefined) merged.space = doc.space
    const groupValue = isAggregate(category)
      ? category.values.find((entry) => entry.space === doc?.space)?._id
      : category
    if (groupValue !== undefined) merged[groupByKey] = groupValue
    return merged
  }

  function modelFor (doc: Doc, models: Map<Ref<Class<Doc>>, AttributeModel[]>): AttributeModel[] {
    try {
      const docClass = Hierarchy.mixinOrClass(doc)
      const ownModel = models.get(docClass)
      if (ownModel !== undefined) return ownModel
      for (const ancestor of client.getHierarchy().getAncestors(docClass)) {
        const ancestorModel = models.get(ancestor)
        if (ancestorModel !== undefined) return ancestorModel
      }
    } catch {}
    return []
  }

  function clearFocus (): void {
    focusStore.set({ provider: $focusStore.provider })
  }

  function storeCollapsed (): void {
    localStorage.setItem(storageKey, String(isCollapsed))
  }

  function toggleCollapsed (): void {
    isCollapsed = !isCollapsed
    if (isCollapsed) {
      const focused = $focusStore.focus
      if (focused !== undefined && orderedDocs.some((doc) => doc._id === focused._id)) clearFocus()
      dispatch('collapsed', { div: rootElement })
    }
    storeCollapsed()
  }

  export function expand (): void {
    isCollapsed = false
    storeCollapsed()
  }

  export function scroll (doc: Doc): void {
    if (!renderedRows.some((row) => row._id === doc._id)) return
    if (isCollapsed) {
      expand()
      setTimeout(() => scroll(doc), SCROLL_RETRY_DELAY_MS)
      return
    }
    rowComponents[doc._id]?.scroll()
  }

  export function getLimited (): Doc[] {
    return renderedRows
  }

  function showMore (): void {
    if (currentLimit !== undefined) currentLimit += SHOW_MORE_STEP
  }

  function openRowMenu (event: MouseEvent, doc: Doc): void {
    dispatch('row-focus', doc)
    if (!selectedObjectIds.some((checked) => checked._id === doc._id)) dispatch('uncheckAll')
    showMenu(event, { object: selectedObjectIds.length > 0 ? selectedObjectIds : doc, baseMenuClass })
  }

  function focusRowOnPointer (event: MouseEvent, doc: Doc): void {
    pointedDoc = doc
    focusPointedDoc(event)
  }

  function insertDocAt (doc: Doc, position: number): void {
    orderedDocs = [...orderedDocs.slice(0, position), doc, ...orderedDocs.slice(position)]
  }

  function isNearEdge (event: DragEvent, edge: 'top' | 'bottom'): boolean {
    if (!(event.target instanceof Element)) return false
    const box = event.target.getBoundingClientRect()
    return Math.abs(event.clientY - (edge === 'top' ? box.top : box.bottom)) < EDGE_TOLERANCE_PX
  }

  function handleDragEnd (event: DragEvent, startPosition: number): void {
    event.preventDefault()
    const listBox = listDiv.getBoundingClientRect()
    if (event.clientY >= listBox.top && event.clientY <= listBox.bottom) return
    const draggedDoc = dragItem.doc
    if (draggedDoc !== undefined && !orderedDocs.some((doc) => doc._id === draggedDoc._id)) {
      insertDocAt(draggedDoc, startPosition)
    }
    if (level === 0) {
      dragItem.doc = undefined
      dragItem.revert = undefined
    }
  }

  function watchDragEnd (target: EventTarget | null, startPosition: number): void {
    target?.addEventListener(
      'dragend',
      (event) => {
        if (event instanceof DragEvent) handleDragEnd(event, startPosition)
      },
      { once: true }
    )
  }

  function startRowDrag (event: DragEvent, doc: Doc, position: number): void {
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.dropEffect = 'move'
    }
    watchDragEnd(event.target, position)
    dragItem = {
      doc,
      revert: () => {
        if (!orderedDocs.some((row) => row._id === doc._id)) insertDocAt(doc, position)
      }
    }
    dragPosition = position
    dispatch('dragstart', { target: event.target, index: position })
  }

  function startNestedDrag (event: CustomEvent<{ target: EventTarget | null, index: number }>): void {
    dragPosition = event.detail.index
    watchDragEnd(event.detail.target, event.detail.index)
  }

  function enterGroup (event: DragEvent): void {
    event.preventDefault()
    const draggedDoc = dragItem.doc
    if (dragPosition !== undefined || draggedDoc === undefined) return
    const existingIndex = orderedDocs.findIndex((doc) => doc._id === draggedDoc._id)
    if (existingIndex >= 0) {
      dragPosition = existingIndex
      return
    }
    if (isNearEdge(event, 'top')) {
      insertDocAt(draggedDoc, 0)
      dragPosition = 0
      dispatch('row-focus', dragItem)
    } else if (isNearEdge(event, 'bottom')) {
      insertDocAt(draggedDoc, orderedDocs.length)
      dragPosition = orderedDocs.length - 1
      dispatch('row-focus', dragItem)
    }
  }

  function leaveGroup (event: DragEvent): void {
    event.stopPropagation()
    if (dragPosition === undefined) return
    const leavingPosition = dragPosition
    orderedDocs = orderedDocs.filter((_, index) => index !== leavingPosition)
    dragPosition = undefined
  }

  function hoverGroup (event: DragEvent): void {
    event.preventDefault()
    event.stopPropagation()
  }

  function dropOnGroup (event: DragEvent): void {
    event.preventDefault()
    void finishDrop(undefined)
  }

  function enterRow (event: DragEvent): void {
    if (dragPosition === undefined) return
    event.stopPropagation()
    event.preventDefault()
  }

  function leaveRow (event: DragEvent, rowIndex: number): void {
    if (dragPosition === undefined) return
    const isTopExit = rowIndex === 0 && disableHeader && isNearEdge(event, 'top')
    const isBottomExit = rowIndex === renderedRows.length - 1 && isNearEdge(event, 'bottom')
    if (isTopExit || isBottomExit) return
    event.stopPropagation()
    event.preventDefault()
  }

  function hoverRow (event: DragEvent, rowIndex: number): void {
    if (!isDeepest || dragPosition === undefined) return
    event.preventDefault()
    event.stopPropagation()
    if (!isRankOrdering || !(event.target instanceof HTMLElement)) return
    const sourcePosition = dragPosition
    const isUpperHalf = event.offsetY < event.target.offsetHeight / 2
    const shouldSwap = (rowIndex < sourcePosition && isUpperHalf) || (rowIndex > sourcePosition && !isUpperHalf)
    if (!shouldSwap) return
    const hoveredDoc = orderedDocs[rowIndex]
    const draggedRow = orderedDocs[sourcePosition]
    if (hoveredDoc === undefined || draggedRow === undefined) return
    const reordered = [...orderedDocs]
    reordered[rowIndex] = draggedRow
    reordered[sourcePosition] = hoveredDoc
    orderedDocs = reordered
    dragPosition = rowIndex
    dispatch('row-focus', dragItem)
  }

  function rankOf (doc: Doc | undefined): string | undefined {
    return doc === undefined ? undefined : (doc as DocWithRank).rank
  }

  function dropOnRow (event: DragEvent): void {
    event.stopPropagation()
    event.preventDefault()
    let droppedRank: string | undefined
    if (dragPosition !== undefined && isRankOrdering) {
      try {
        const nextRank = makeRank(rankOf(renderedRows[dragPosition - 1]), rankOf(renderedRows[dragPosition + 1]))
        if (nextRank !== rankOf(dragItem.doc)) droppedRank = nextRank
      } catch {}
    }
    void finishDrop(droppedRank)
  }

  async function finishDrop (droppedRank: string | undefined): Promise<void> {
    try {
      const draggedDoc = dragItem.doc
      if (draggedDoc === undefined) return
      const update: DocumentUpdate<Doc> = {}
      if (droppedRank !== undefined) Object.assign(update, { rank: droppedRank })
      for (const [key, targetValue] of Object.entries(buildGroupProps(draggedDoc))) {
        if (targetValue !== Reflect.get(draggedDoc, key)) Object.assign(update, { [key]: targetValue })
      }
      if (Object.keys(update).length > 0) await client.update(draggedDoc, update)
    } finally {
      dragItem.doc = undefined
      dragItem.revert = undefined
      dragPosition = undefined
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={rootElement}
  class="category-container"
  class:listGrid-container={level === 0}
  class:collapsed={isCollapsed}
  class:category-one={oneCat}
  class:category-last={lastCat}
  class:disableHeader
  in:fade|local={{ duration: 50 }}
  on:dragover={hoverGroup}
  on:dragenter={enterGroup}
  on:dragleave={leaveGroup}
  on:drop={dropOnGroup}
>
  {#if !disableHeader}
    <ListHeader
      {groupByKey}
      {category}
      {space}
      {level}
      limited={isDeepest ? displayedCount : itemProj.length}
      itemsProj={itemProj}
      items={renderedRows}
      {listProvider}
      {headerComponent}
      {createItemDialog}
      {createItemDialogProps}
      {createItemLabel}
      {createItemEvent}
      {extraHeaders}
      newObjectProps={buildGroupProps}
      flat={flatHeaders}
      collapsed={isCollapsed}
      {props}
      {lastCat}
      {viewOptions}
      loading={isLoading}
      on:collapse={toggleCollapsed}
    />
  {/if}
  <Scroller horizontal shrink noFade={false} showOverflowArrows>
    <ExpandCollapse isExpanded={!isCollapsed || isDragInGroup}>
      {#if isDeepest}
        {#if areRowsVisible}
          {#key configurationsVersion}
            {#each renderedRows as doc, rowIndex (doc._id)}
              {@const isLastRow = rowIndex === renderedRows.length - 1 && displayedCount >= itemProj.length}
              <ListItem
                bind:this={rowComponents[doc._id]}
                docObject={doc}
                model={modelFor(doc, itemModels)}
                {groupByKey}
                {readonly}
                {props}
                {compactMode}
                selected={$focusStore.focus?._id === doc._id}
                checked={selectedObjectIds.some((checkedDoc) => checkedDoc._id === doc._id)}
                last={isLastRow}
                lastCat={isLastRow && (oneCat || lastCat)}
                depth={depthByDocId.get(doc._id) ?? 0}
                tree={hasAnyParent}
                expandable={parentDocIds.has(doc._id)}
                expanded={!foldedParentIds.has(doc._id)}
                on:check={(event) => dispatch('check', { docs: event.detail.docs, value: event.detail.value })}
                on:contextmenu={(event) => openRowMenu(event, doc)}
                on:mouseover={(event) => focusRowOnPointer(event, doc)}
                on:mouseenter={(event) => focusRowOnPointer(event, doc)}
                on:tree-toggle={() => toggleFold(doc)}
                on:on-mount={() => (hasMountedRows = true)}
                on:dragstart={(event) => startRowDrag(event, doc, rowIndex)}
                on:dragenter={enterRow}
                on:dragleave={(event) => leaveRow(event, rowIndex)}
                on:dragover={(event) => hoverRow(event, rowIndex)}
                on:drop={dropOnRow}
              />
            {/each}
          {/key}
        {/if}
        {#if displayedCount < itemProj.length}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="listGrid antiList__row row gap-2 flex-grow hoverable showMore last"
            class:lastCat={oneCat || lastCat}
            on:mouseenter={clearFocus}
            on:click={showMore}
          >
            <span class="caption-color"><Label label={ui.string.ShowMore} /></span>
            {#if isLoading}
              <div class="p-1"><Loading shrink size={'small'} /></div>
            {:else}
              <span class="content-halfcontent-color ml-0-5">({displayedCount} / {itemProj.length})</span>
            {/if}
          </div>
        {/if}
      {:else}
        <slot
          name="category"
          docs={itemProj}
          {_class}
          {space}
          {lookup}
          {baseMenuClass}
          {config}
          {configurations}
          {selectedObjectIds}
          {createItemDialog}
          {createItemLabel}
          {viewOptions}
          {docKeys}
          newObjectProps={buildGroupProps}
          {flatHeaders}
          {props}
          level={level + 1}
          {groupPersistKey}
          {viewOptionsConfig}
          {listDiv}
          {readonly}
          dragstart={startNestedDrag}
        />
      {/if}
    </ExpandCollapse>
  </Scroller>
</div>
