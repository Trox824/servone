<script lang="ts">
  import contact from '@hcengineering/contact'
  import { statusByUserStore } from '@hcengineering/contact-resources'
  import { type Doc, reduceCalls, type Ref } from '@hcengineering/core'
  import type { DocNotifyContext } from '@hcengineering/notification'
  import { getResource, type IntlString, translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import ui, { type Action, type AnySvelteComponent, type IconSize, Label, ModernButton, NavGroup } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { getDocTitle } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'
  import chunter from '../../../plugin'
  import { getChannelName, getObjectIcon } from '../../../utils'
  import type { ChatNavItemModel, SortFnOptions } from '../types'
  import ChatNavItem from './ChatNavItem.svelte'
  import { CONTEXT_DRAG_TYPE } from '../../../sections/store'

  export let id: string
  export let header: IntlString
  export let objects: Doc[]
  export let itemsCount: number
  export let contexts: DocNotifyContext[]
  export let actions: Action[] = []
  export let objectId: Ref<Doc> | undefined
  export let sortFn: (items: ChatNavItemModel[], options: SortFnOptions) => ChatNavItemModel[]
  export let emptyLabel: IntlString | undefined = undefined
  export let onDropContext: ((contextId: Ref<DocNotifyContext>) => void) | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()

  let builtRows: ChatNavItemModel[] = []
  let isDropHighlighted = false

  async function buildRowModel (doc: Doc): Promise<ChatNavItemModel> {
    const docClass = doc._class
    const iconMixin = hierarchy.classHierarchyMixin(docClass, view.mixin.ObjectIcon)
    const icon: AnySvelteComponent | undefined =
      iconMixin?.component !== undefined ? await getResource(iconMixin.component) : getObjectIcon(docClass)
    const isAvatarClass =
      hierarchy.isDerived(docClass, chunter.class.DirectMessage) || hierarchy.isDerived(docClass, contact.class.Person)
    const iconSize: IconSize = isAvatarClass ? 'x-small' : 'small'
    const channelName = await getChannelName(doc._id, docClass, doc)
    const title = channelName ?? (await translate(hierarchy.getClass(docClass).label, {}))
    const isDocumentChat =
      hierarchy.classHierarchyMixin(docClass, view.mixin.ObjectIdentifier) !== undefined &&
      !hierarchy.isDerived(docClass, chunter.class.ChunterSpace) &&
      !hierarchy.isDerived(docClass, contact.class.Person)
    const description = isDocumentChat ? await getDocTitle(client, doc._id, docClass, doc) : undefined

    return {
      id: doc._id,
      object: doc,
      title,
      description,
      icon,
      iconSize,
      iconProps: { showStatus: true },
      withIconBackground: false
    }
  }

  const rebuildRows = reduceCalls(async (docs: Doc[]): Promise<void> => {
    builtRows = await Promise.all(docs.map(buildRowModel))
  })

  $: void rebuildRows(objects)

  $: orderedRows = sortFn(builtRows, { contexts, userStatusByAccount: $statusByUserStore })
  $: hasMoreToShow = itemsCount > builtRows.length
  $: pinnedRow = orderedRows.find((row) => row.id === objectId)
  $: isRendered = (orderedRows.length > 0 && contexts.length > 0) || emptyLabel !== undefined
  $: isEmptyGroup = orderedRows.length === 0 && emptyLabel === undefined

  function contextOf (rowId: string): DocNotifyContext | undefined {
    return contexts.find((entry) => entry.objectId === rowId)
  }

  function isAcceptableDrag (event: DragEvent): boolean {
    return onDropContext !== undefined && (event.dataTransfer?.types.includes(CONTEXT_DRAG_TYPE) ?? false)
  }

  function handleDragOver (event: DragEvent): void {
    if (!isAcceptableDrag(event)) return
    event.preventDefault()
    isDropHighlighted = true
  }

  function handleDrop (event: DragEvent): void {
    isDropHighlighted = false
    if (!isAcceptableDrag(event)) return
    event.preventDefault()
    const droppedId = event.dataTransfer?.getData(CONTEXT_DRAG_TYPE)
    if (droppedId !== undefined && droppedId !== '') onDropContext?.(droppedId as Ref<DocNotifyContext>)
  }
</script>

{#if isRendered}
  <div
    role="group"
    class="rounded-md"
    class:bg-sidebar-accent={isDropHighlighted}
    on:dragover={handleDragOver}
    on:dragleave={() => {
      isDropHighlighted = false
    }}
    on:drop={handleDrop}
  >
    <NavGroup
      _id={id}
      label={header}
      categoryName={id}
      {actions}
      isFold
      empty={isEmptyGroup}
      visible={pinnedRow !== undefined}
      noDivider
    >
      {#if orderedRows.length === 0 && emptyLabel !== undefined}
        <div class="mx-4 my-1 text-xs text-muted-foreground">
          <Label label={emptyLabel} />
        </div>
      {/if}
      {#each orderedRows as row (row.id)}
        <ChatNavItem
          context={contextOf(row.id)}
          isSelected={objectId === row.id}
          item={row}
          type={'type-object'}
          on:select
        />
      {/each}
      {#if hasMoreToShow}
        <div class="m-[var(--spacing-1)] text-[0.75rem]">
          <ModernButton
            label={ui.string.ShowMore}
            kind={'tertiary'}
            inheritFont
            size={'extra-small'}
            on:click={() => {
              dispatch('show-more')
            }}
          />
        </div>
      {/if}
      <svelte:fragment slot="visible" let:isOpen>
        {#if pinnedRow !== undefined && !isOpen}
          <ChatNavItem
            context={contextOf(pinnedRow.id)}
            isSelected
            item={pinnedRow}
            type={'type-object'}
            on:select
          />
        {/if}
      </svelte:fragment>
    </NavGroup>
  </div>
{/if}
