<script lang="ts">
  import contact from '@hcengineering/contact'
  import { AccountRole, type Ref, getCurrentAccount } from '@hcengineering/core'
  import { copyTextToClipboard, createQuery, getClient } from '@hcengineering/presentation'
  import setting from '@hcengineering/setting'
  import {
    type Action,
    IconAdd,
    type Location,
    SelectPopup,
    eventToHTMLElement,
    getEventPopupPositionElement,
    getLocation,
    getPopupPositionElement,
    location,
    locationToUrl,
    navigate,
    showPopup
  } from '@hcengineering/ui'
  import view, { type Filter, type FilteredView, type ViewOptions, type Viewlet } from '@hcengineering/view'
  import {
    EditBoxPopup,
    TreeItem,
    TreeNode,
    activeViewlet,
    filterStore,
    getViewOptions,
    makeViewletKey,
    selectedFilterStore,
    setActiveViewletId,
    setFilters,
    setViewOptions,
    viewOptionStore
  } from '@hcengineering/view-resources'
  import copy from 'fast-copy'
  import { createEventDispatcher } from 'svelte'
  import TodoCheck from './icons/TodoCheck.svelte'
  import TodoUncheck from './icons/TodoUncheck.svelte'

  export let alias: string | undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const currentAccount = getCurrentAccount()
  const mayUseSavedViews =
    currentAccount.role !== AccountRole.ReadOnlyGuest && currentAccount.role !== AccountRole.DocGuest
  const savedViewsQuery = createQuery()

  let ownViews: FilteredView[] = []
  let addableViews: FilteredView[] = []
  let activeViewId: Ref<FilteredView> | undefined

  $: if (alias !== undefined && mayUseSavedViews) {
    savedViewsQuery.query(view.class.FilteredView, { attachedTo: alias }, (deliveredViews) => {
      ownViews = deliveredViews.filter((savedView) => savedView.users.includes(currentAccount.uuid))
      addableViews = deliveredViews.filter(
        (savedView) => savedView.sharable === true && !savedView.users.includes(currentAccount.uuid)
      )
      const requestedViewId = getLocation().query?.filterViewId
      if (requestedViewId != null) {
        const requestedView = deliveredViews.find((savedView) => savedView._id === requestedViewId)
        if (requestedView !== undefined) void openSavedView(requestedView)
      }
    })
  } else {
    savedViewsQuery.unsubscribe()
    ownViews = []
    addableViews = []
  }

  $: isGroupShown = alias !== 'tracker' && (ownViews.length > 0 || addableViews.length > 0)
  $: dispatch('shown', isGroupShown)

  $: refreshActiveView($filterStore, $location, ownViews, $viewOptionStore)
  $: activeOwnView = ownViews.find((savedView) => savedView._id === activeViewId)

  function storedLocationOf (savedView: FilteredView): Location {
    return {
      path: savedView.location.path,
      query: savedView.location.query ?? undefined,
      fragment: savedView.location.fragment ?? undefined
    }
  }

  function refreshActiveView (
    activeFilters: Filter[],
    currentLocation: Location,
    candidateViews: FilteredView[],
    optionsByKey: Map<string, ViewOptions>
  ): void {
    if (activeFilters.length > 0) {
      const currentPath = currentLocation.path.join('/')
      const pinnedView = $selectedFilterStore
      let matchedId: Ref<FilteredView> | undefined

      if (pinnedView !== undefined && pinnedView.location.path.join('/') === currentPath) {
        matchedId = pinnedView._id
      } else {
        const currentFilters = JSON.stringify(activeFilters)
        const currentViewletId = $activeViewlet[makeViewletKey(currentLocation)]
        matchedId = candidateViews.find((savedView) => {
          if (savedView.location.path.join('/') !== currentPath) return false
          if (savedView.filters !== currentFilters) return false
          if (savedView.viewletId !== currentViewletId) return false
          if (savedView.viewletId === null) return true
          const viewletStub = { _id: savedView.viewletId } as Viewlet
          return JSON.stringify(savedView.viewOptions) === JSON.stringify(getViewOptions(viewletStub, optionsByKey))
        })?._id
      }

      if (matchedId !== undefined) {
        activeViewId = matchedId
        dispatch('select', true)
        return
      }
    }
    selectedFilterStore.set(undefined)
    activeViewId = undefined
    dispatch('select', false)
  }

  async function openSavedView (savedView: FilteredView): Promise<void> {
    selectedFilterStore.set(savedView)
    const storedLocation = storedLocationOf(savedView)
    navigate(storedLocation)

    const viewletId = savedView.viewletId
    if (viewletId !== undefined && viewletId !== null) {
      const savedViewlet = await client.findOne(view.class.Viewlet, { _id: viewletId })
      setActiveViewletId(viewletId, storedLocation)
      if (savedViewlet !== undefined && savedView.viewOptions !== undefined) {
        setViewOptions(savedViewlet, copy(savedView.viewOptions))
      }
    }
    const savedFilters: Filter[] = JSON.parse(savedView.filters)
    setFilters(savedFilters)
  }

  function buildShareUrl (savedView: FilteredView): string {
    const { protocol, hostname, port } = window.location
    const origin = `${protocol}//${hostname}${port !== '' ? ':' + port : ''}`
    const path = locationToUrl({
      path: savedView.location.path,
      query: { ...(savedView.location.query ?? {}), filterViewId: savedView._id },
      fragment: savedView.location.fragment ?? undefined
    })
    return origin + path
  }

  async function buildEntryActions (savedView: FilteredView, originalEvent?: MouseEvent): Promise<Action[]> {
    const copyLinkAction: Action = {
      label: view.string.CopyToClipboard,
      icon: view.icon.CopyLink,
      inline: true,
      action: async () => {
        await copyTextToClipboard(buildShareUrl(savedView))
      }
    }

    if (savedView.createdBy === undefined || !currentAccount.socialIds.includes(savedView.createdBy)) {
      const hideAction: Action = {
        label: view.string.Hide,
        icon: view.icon.Archive,
        action: async () => {
          await client.update(savedView, { $pull: { users: currentAccount.uuid } })
        }
      }
      return [hideAction, copyLinkAction]
    }

    const publicToggleAction: Action = {
      label: view.string.PublicView,
      icon: savedView.sharable === true ? TodoCheck : TodoUncheck,
      action: async () => {
        await client.update(savedView, { sharable: savedView.sharable !== true })
      }
    }
    const renameAction: Action = {
      label: view.string.Rename,
      icon: contact.icon.Edit,
      action: async (_ctx, actionEvent) => {
        showPopup(
          EditBoxPopup,
          { value: savedView.name, format: 'text' },
          getEventPopupPositionElement(originalEvent ?? actionEvent),
          async (newName) => {
            if (newName !== undefined) await client.update(savedView, { name: newName })
          }
        )
      }
    }
    const deleteAction: Action = {
      label: setting.string.Delete,
      icon: view.icon.Delete,
      action: async () => {
        await client.remove(savedView)
      }
    }
    return [publicToggleAction, renameAction, deleteAction, copyLinkAction]
  }

  async function buildGroupActions (): Promise<Action[]> {
    if (addableViews.length === 0) return []
    const addViewAction: Action = {
      label: view.string.AddSavedView,
      icon: IconAdd,
      action: async (_ctx, clickEvent) => {
        showPopup(
          SelectPopup,
          { value: addableViews.map((savedView) => ({ id: savedView._id, text: savedView.name })), searchable: true },
          getPopupPositionElement(eventToHTMLElement(clickEvent as MouseEvent), { v: 'top', h: 'right' }),
          async (pickedId) => {
            const pickedView = addableViews.find((savedView) => savedView._id === pickedId)
            if (pickedView !== undefined) {
              await client.update(pickedView, { $push: { users: currentAccount.uuid } })
            }
          }
        )
      }
    }
    return [addViewAction]
  }
</script>

{#if isGroupShown}
  <TreeNode
    _id={'tree-saved'}
    label={view.string.FilteredViews}
    highlighted={activeViewId !== undefined}
    visible={activeViewId !== undefined}
    isFold
    empty={ownViews.length === 0}
    actions={buildGroupActions}
  >
    {#each ownViews as savedView (savedView._id)}
      <TreeItem
        _id={savedView._id}
        title={savedView.name}
        selected={savedView._id === activeViewId}
        actions={(originalEvent) => buildEntryActions(savedView, originalEvent)}
        on:click={() => openSavedView(savedView)}
      />
    {/each}
    <svelte:fragment slot="visible">
      {#if activeOwnView !== undefined}
        {@const foldedActiveView = activeOwnView}
        <TreeItem
          _id={foldedActiveView._id}
          title={foldedActiveView.name}
          selected
          actions={(originalEvent) => buildEntryActions(foldedActiveView, originalEvent)}
        />
      {/if}
    </svelte:fragment>
  </TreeNode>
{/if}
