<script lang="ts">
  import type { Class, Doc, DocumentQuery, FindOptions, Ref, Space } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { ActionContext } from '@hcengineering/presentation'
  import { type AnyComponent, Loading, Scroller, resizeObserver } from '@hcengineering/ui'
  import type { BuildModelKey, ViewOptionModel, ViewOptions, Viewlet } from '@hcengineering/view'
  import { onMount } from 'svelte'
  import EmptyState from '../../../../components/EmptyState.svelte'
  import { useEmptyState } from '../../../../lib/empty-state'
  import { ListSelectionProvider, focusStore, resultIssueCountStore } from '../..'
  import List from './List.svelte'

  export let _class: Ref<Class<Doc>>
  export let space: Ref<Space> | undefined = undefined
  export let query: DocumentQuery<Doc> = {}
  export let options: FindOptions<Doc> | undefined = undefined
  export let viewlet: Viewlet
  export let config: Array<string | BuildModelKey>
  export let configurations: Record<Ref<Class<Doc>>, Viewlet['config']> | undefined
  export let createItemDialog: AnyComponent | undefined
  export let createItemDialogProps: Record<string, unknown> | undefined = undefined
  export let createItemLabel: IntlString | undefined
  export let createItemEvent: string | undefined
  export let viewOptions: ViewOptions
  export let viewOptionsConfig: ViewOptionModel[] | undefined = undefined
  export let props: Record<string, unknown> = {}
  export let baseMenuClass: Ref<Class<Doc>> | undefined = undefined

  const COMPACT_MAX_WIDTH_PX = 800
  const HEADER_FADE_PER_LEVEL = 2.75

  const selectionProvider = new ListSelectionProvider((offset, of, direction, noScroll) => {
    if (direction === 'vertical') list?.select(offset, of, noScroll)
  })
  const checkedDocs = selectionProvider.selection
  const emptyStateInfo = useEmptyState()

  let list: List | undefined
  let scrollerElement: HTMLDivElement | undefined
  let containerWidth = 0
  let listBlockHeight = 0

  onMount(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })

  function measureWidth (element: Element): void {
    containerWidth = element.clientWidth
  }

  function measureListBlock (element: Element): void {
    listBlockHeight = element.clientHeight
  }

  function revealCollapsedGroup (event: CustomEvent<{ div: HTMLDivElement }>): void {
    if (scrollerElement === undefined) return
    const groupTop = event.detail.div.getBoundingClientRect().top
    if (scrollerElement.getBoundingClientRect().top > groupTop) event.detail.div.scrollIntoView(true)
  }

  $: isCompact = containerWidth <= COMPACT_MAX_WIDTH_PX
  $: isWaitingForFirstRows = listBlockHeight === 0 && $resultIssueCountStore !== 0
  $: isEmptyStateVisible =
    $emptyStateInfo !== undefined && $resultIssueCountStore === 0 && !$emptyStateInfo.filtered
</script>

<ActionContext context={{ mode: 'browser' }} />
<div class="w-full h-full py-4 clear-mins" use:resizeObserver={measureWidth}>
  <Scroller
    bind:divScroll={scrollerElement}
    fade={{ multipler: { top: HEADER_FADE_PER_LEVEL * viewOptions.groupBy.length, bottom: 0 } }}
    padding={'0 1rem'}
    noFade
    checkForHeaders
  >
    <div use:resizeObserver={measureListBlock}>
      <List
        bind:this={list}
        reportResultCount={true}
        {_class}
        {space}
        {query}
        {config}
        {configurations}
        {options}
        {createItemDialog}
        {createItemDialogProps}
        {baseMenuClass}
        {createItemLabel}
        {createItemEvent}
        {viewOptions}
        {props}
        listProvider={selectionProvider}
        compactMode={isCompact}
        viewOptionsConfig={viewOptionsConfig ?? viewlet.viewOptions?.other}
        selectedObjectIds={$checkedDocs ?? []}
        selection={selectionProvider.current($focusStore)}
        on:row-focus={(event) => selectionProvider.updateFocus(event.detail ?? undefined)}
        on:check={(event) => selectionProvider.updateSelection(event.detail.docs, event.detail.value)}
        on:content={(event) => selectionProvider.update(event.detail)}
        on:collapsed={revealCollapsedGroup}
      />
    </div>
    {#if isWaitingForFirstRows}
      <Loading />
    {/if}
    {#if isEmptyStateVisible && $emptyStateInfo !== undefined}
      <EmptyState
        icon={$emptyStateInfo.icon}
        iconProps={$emptyStateInfo.iconProps}
        label={$emptyStateInfo.label}
        hint={$emptyStateInfo.hasCreate && $emptyStateInfo.copy === undefined}
        title={$emptyStateInfo.copy?.message}
        actions={$emptyStateInfo.copy?.actions}
      />
    {/if}
  </Scroller>
</div>
