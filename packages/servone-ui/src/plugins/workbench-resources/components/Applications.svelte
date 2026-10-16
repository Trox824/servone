<script lang="ts">
  import { chatId } from '@hcengineering/chat'
  import { NotificationType } from '@hcengineering/communication-types'
  import type { Ref } from '@hcengineering/core'
  import { inboxId } from '@hcengineering/inbox'
  import notification, { type DocNotifyContext, type InboxNotification } from '@hcengineering/notification'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import { getResource } from '@hcengineering/platform'
  import { createNotificationsQuery, getClient } from '@hcengineering/presentation'
  import ui, { IconDown, IconUp, Menu, Scroller, deviceOptionsStore, showPopup, type Action } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { NavLink } from '@hcengineering/view-resources'
  import type { Application } from '@hcengineering/workbench'
  import { Ellipsis, Search } from '@lucide/svelte'
  import { createEventDispatcher } from 'svelte'
  import { arrangeApps, moveApp } from '../../../lib/app-rail'
  import { phoneBarAliases, railString, saveAppOrder, unavailableApps, watchAppRail } from '../rail'
  import { openSearch } from '../../../shell/open-search'
  import { hideApplication } from '../utils'
  import AppItem from './AppItem.svelte'
  import MoreApps from './MoreApps.svelte'
  import SetupPill from '../../tracker-resources/onboarding/SetupPill.svelte'

  interface AppButtonOverrides {
    selected?: boolean
    navigator?: boolean
    notify?: boolean
    onClick?: (event: MouseEvent) => void
  }

  type DropSide = 'before' | 'after'

  const APP_DRAG_MIME = 'application/x-servone-app'

  export let active: Ref<Application> | undefined
  export let apps: Application[] = []
  export let direction: 'vertical' | 'horizontal' = 'vertical'
  export let customAppProps: Map<string, AppButtonOverrides> = new Map()

  const dispatch = createEventDispatcher()

  const rail = watchAppRail()
  const presentationClient = getClient()

  let hasUnreadNotifications = false
  let hasUnreadMessages = false
  let hasInboxActivity = false
  let inboxActivityCheck:
  | ((byContext: Map<Ref<DocNotifyContext>, InboxNotification[]>) => Promise<boolean>)
  | undefined
  let draggedApp: Application | undefined
  let dropTargetApp: Application | undefined

  createNotificationsQuery().query({ read: false, limit: 1 }, (found) => {
    hasUnreadNotifications = found.getResult().length > 0
  })
  createNotificationsQuery().query({ read: false, type: NotificationType.Message, limit: 1 }, (found) => {
    hasUnreadMessages = found.getResult().length > 0
  })

  void getResource(notification.function.HasInboxNotifications).then((check) => {
    inboxActivityCheck = check
  })
  const inboxByContext = InboxNotificationsClientImpl.getClient().inboxNotificationsByContext
  $: if (inboxActivityCheck !== undefined) {
    void inboxActivityCheck($inboxByContext).then((hasActivity) => {
      hasInboxActivity = hasActivity
    })
  }

  $: fullOrder = arrangeApps(apps, $rail.order, unavailableApps(apps, $rail))
  $: hiddenAppIds = new Set($rail.hidden.map((hiddenDoc) => hiddenDoc.attachedTo))
  $: railApps = fullOrder.filter((app) => !hiddenAppIds.has(app._id))

  $: isPhoneBar = $deviceOptionsStore.isMobile && direction === 'horizontal'
  $: pinnedApps = pickPhoneBarApps(railApps, $phoneBarAliases)
  $: isOverflowAppActive = railApps.some((app) => app._id === active && !pinnedApps.includes(app))
  let isMoreOpen = false
  $: shownApps = isPhoneBar ? pinnedApps : railApps
  $: scrollerPadding = direction === 'vertical' ? '.5rem .75rem' : isPhoneBar ? '0 .25rem' : '.75rem .5rem'

  function pickPhoneBarApps (candidates: Application[], aliases: string[]): Application[] {
    return aliases.flatMap((alias) => candidates.filter((app) => app.alias === alias))
  }

  function needsDot (
    app: Application,
    hasUnread: boolean,
    hasUnreadMessage: boolean,
    hasInbox: boolean
  ): boolean {
    if (app.position === 'bottom') return app.alias === chatId && hasUnread
    if (app.alias === inboxId) return hasInbox || hasUnread
    if (app.alias === chatId) return hasUnreadMessage
    return false
  }

  function buildItemProps (
    app: Application,
    activeId: Ref<Application> | undefined,
    isNavigatorVisible: boolean,
    hasDot: boolean,
    overrides: AppButtonOverrides | undefined
  ): Omit<AppButtonOverrides, 'onClick'> & { dataId: string, icon: Application['icon'], label: Application['label'] } {
    const isActive = app._id === activeId
    const { onClick, ...overrideProps } = overrides ?? {}
    return {
      selected: isActive,
      icon: app.icon,
      label: app.label,
      navigator: isActive && isNavigatorVisible,
      notify: hasDot,
      ...overrideProps,
      dataId: `app-sidebar-${app.alias}`
    }
  }

  function handleAppClick (app: Application, event: MouseEvent): void {
    const customHandler = customAppProps.get(app.alias)?.onClick
    if (customHandler !== undefined) {
      customHandler(event)
      return
    }
    if (app._id === active) dispatch('toggleNav')
  }

  function preloadAppCode (app: Application): void {
    const firstSpecial = app.navigatorModel?.specials?.[0]
    const componentIds = [app.component, app.navHeaderComponent, app.navHeaderActions, firstSpecial?.component]
    componentIds.forEach((componentId) => {
      if (componentId !== undefined) void getResource(componentId)
    })
  }

  async function moveOntoPlaceOf (movedApp: Application, targetApp: Application): Promise<void> {
    const reorderedIds = moveApp(
      fullOrder.map((app) => app._id),
      movedApp._id,
      targetApp._id
    )
    await saveAppOrder(presentationClient, $rail, reorderedIds)
  }

  function buildMenuActions (app: Application, orderedApps: Application[]): Action[] {
    const position = orderedApps.findIndex((candidate) => candidate._id === app._id)
    const moveCandidates = [
      { neighbour: orderedApps[position - 1], label: railString.MoveUp, icon: IconUp },
      { neighbour: orderedApps[position + 1], label: railString.MoveDown, icon: IconDown }
    ]
    const moveActions: Action[] = moveCandidates.flatMap(({ neighbour, label, icon }) =>
      neighbour === undefined
        ? []
        : [{ label, icon, action: async () => { await moveOntoPlaceOf(app, neighbour) } }]
    )
    const hideAction: Action = {
      label: railString.HideFromSidebar,
      icon: view.icon.EyeCrossed,
      action: async () => {
        await hideApplication(app)
      }
    }
    return [...moveActions, hideAction]
  }

  function openSlotMenu (event: MouseEvent, app: Application): void {
    event.preventDefault()
    const slotElement = event.currentTarget
    if (!(slotElement instanceof HTMLElement)) return
    showPopup(Menu, { actions: buildMenuActions(app, railApps) }, slotElement)
  }

  function openMoreApps (): void {
    isMoreOpen = true
    showPopup(MoreApps, { apps: railApps, active }, 'account-portrait', () => {
      isMoreOpen = false
    })
  }

  function handleDragStart (event: DragEvent, app: Application): void {
    if (event.dataTransfer === null) return
    event.dataTransfer.setData(APP_DRAG_MIME, app._id)
    event.dataTransfer.effectAllowed = 'move'
    draggedApp = app
  }

  function handleDragOver (event: DragEvent, app: Application): void {
    if (draggedApp === undefined) return
    event.preventDefault()
    dropTargetApp = app
  }

  function handleDrop (event: DragEvent, app: Application): void {
    if (draggedApp === undefined || dropTargetApp === undefined) return
    event.preventDefault()
    const movedApp = draggedApp
    clearDragState()
    if (movedApp._id !== app._id) void moveOntoPlaceOf(movedApp, app)
  }

  function clearDragState (): void {
    draggedApp = undefined
    dropTargetApp = undefined
  }

  function computeDropSide (
    app: Application,
    dragged: Application | undefined,
    target: Application | undefined,
    order: Application[]
  ): DropSide | undefined {
    if (dragged === undefined || target === undefined || target._id !== app._id || dragged._id === app._id) {
      return undefined
    }
    const draggedPosition = order.findIndex((candidate) => candidate._id === dragged._id)
    const targetPosition = order.findIndex((candidate) => candidate._id === app._id)
    return draggedPosition < targetPosition ? 'after' : 'before'
  }
</script>

<div
  class="clear-mins relative"
  class:flex-row-center={direction === 'horizontal'}
  class:flex-col-center={direction === 'vertical'}
  class:apps-horizontal={direction === 'horizontal'}
  class:apps-vertical={direction === 'vertical'}
>
  {#if $rail.isLoaded}
    <Scroller
      invertScroll
      padding={scrollerPadding}
      gap={direction === 'horizontal' ? 'gap-1' : 'gapV-1'}
      horizontal={direction === 'horizontal'}
      contentDirection={direction}
      align={direction === 'horizontal' ? 'center' : 'start'}
      buttons={'union'}
    >
      {#if direction === 'vertical'}
        <div class="app-slot relative shrink-0">
          <AppItem
            icon={Search}
            iconFill="none"
            label={ui.string.Search}
            keys={['Meta + keyK']}
            dataId={'app-sidebar-search'}
            on:click={openSearch}
          />
        </div>
      {/if}
      {#each shownApps as app (app._id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="app-slot relative shrink-0"
          class:opacity-40={draggedApp?._id === app._id}
          data-drop={computeDropSide(app, draggedApp, dropTargetApp, fullOrder)}
          draggable="true"
          on:pointerenter={() => { preloadAppCode(app) }}
          on:focusin={() => { preloadAppCode(app) }}
          on:contextmenu={(event) => { openSlotMenu(event, app) }}
          on:dragstart={(event) => { handleDragStart(event, app) }}
          on:dragover={(event) => { handleDragOver(event, app) }}
          on:drop={(event) => { handleDrop(event, app) }}
          on:dragend={clearDragState}
        >
          <NavLink app={app.alias} shrink={0} disabled={app._id === active}>
            <AppItem
              {...buildItemProps(
                app,
                active,
                $deviceOptionsStore.navigator.visible,
                needsDot(app, hasUnreadNotifications, hasUnreadMessages, hasInboxActivity),
                customAppProps.get(app.alias)
              )}
              on:click={(event) => { handleAppClick(app, event) }}
            />
          </NavLink>
        </div>
      {/each}
      {#if isPhoneBar}
        <div class="app-slot relative shrink-0">
          <AppItem
            icon={Ellipsis}
            label={railString.MoreApps}
            selected={isOverflowAppActive || isMoreOpen}
            dataId={'app-sidebar-more'}
            on:click={openMoreApps}
          />
        </div>
      {/if}
      <div class="trailing-spacer"></div>
    </Scroller>
    {#if direction === 'vertical'}
      <SetupPill />
    {/if}
  {/if}
</div>

<style>
  .apps-horizontal {
    justify-content: center;
    margin: 0 0.5rem 0 0.25rem;
    height: var(--app-panel-width);
    min-height: 4rem;
  }
  .apps-vertical {
    margin-bottom: 0.5rem;
    width: var(--app-panel-width);
    min-width: 4rem;
  }
  .apps-vertical .trailing-spacer {
    flex-shrink: 0;
    height: 0.5rem;
    min-height: 0.5rem;
  }
  .apps-horizontal .trailing-spacer {
    flex-shrink: 0;
    width: 0.5rem;
    min-width: 0.5rem;
  }
  .app-slot[data-drop]::after {
    content: '';
    position: absolute;
    background-color: var(--primary-button-outline);
    border-radius: 1px;
    pointer-events: none;
  }
  .apps-vertical .app-slot[data-drop]::after {
    left: 0;
    right: 0;
    height: 2px;
  }
  .apps-vertical .app-slot[data-drop='before']::after {
    top: -0.1875rem;
  }
  .apps-vertical .app-slot[data-drop='after']::after {
    bottom: -0.1875rem;
  }
  .apps-horizontal .app-slot[data-drop]::after {
    top: 0;
    bottom: 0;
    width: 2px;
  }
  .apps-horizontal .app-slot[data-drop='before']::after {
    left: -0.1875rem;
  }
  .apps-horizontal .app-slot[data-drop='after']::after {
    right: -0.1875rem;
  }
</style>
