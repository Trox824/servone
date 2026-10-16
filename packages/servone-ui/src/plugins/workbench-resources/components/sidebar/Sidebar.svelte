<script lang="ts">
  import { getCurrentAccount, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { location, panelstore } from '@hcengineering/ui'
  import type { Widget, WidgetPreference } from '@hcengineering/workbench'
  import { component as lichComponent } from '../../../calendar-resources/lich/plugin'
  import workbench from '../../plugin'
  import { closeWidget, sidebarStore, SidebarVariant } from '../../sidebar'
  import { isAllowedToRole } from '../../utils'
  import BugReport from '../../../../shell/BugReport.svelte'
  import { relatedWidget } from './related-widget'
  import SidebarExpanded from './SidebarExpanded.svelte'
  import SidebarMini from './SidebarMini.svelte'

  const virtualOfficeWidgetId = 'love:ids:LoveWidget' as Ref<Widget>
  const calendarWidgetId = 'calendar:ids:CalendarWidget' as Ref<Widget>
  const CALENDAR_APP_ALIAS = 'time'

  const currentAccount = getCurrentAccount()
  const preferencesQuery = createQuery()

  const availableWidgets: Widget[] = [
    ...getClient()
      .getModel()
      .findAllSync(workbench.class.Widget, {})
      .filter((widget) => isAllowedToRole(widget.accessLevel, currentAccount))
      .filter((widget) => widget._id !== virtualOfficeWidgetId)
      .map((widget) =>
        widget._id === calendarWidgetId ? { ...widget, switcherComponent: lichComponent.NeedsYouSwitcher } : widget
      ),
    relatedWidget
  ]

  let preferences: WidgetPreference[] = []
  preferencesQuery.query(workbench.class.WidgetPreference, {}, (loadedPreferences) => {
    preferences = loadedPreferences
  })

  $: isCalendarAppOpen = $location.path[2] === CALENDAR_APP_ALIAS
  $: shownWidgets = isCalendarAppOpen
    ? availableWidgets.filter((widget) => widget._id !== calendarWidgetId)
    : availableWidgets

  $: openWidgetId = $sidebarStore.widget
  $: if (openWidgetId !== undefined && !shownWidgets.some((widget) => widget._id === openWidgetId)) {
    closeWidget(openWidgetId)
  }

  $: isMinimised = $sidebarStore.variant === SidebarVariant.MINI
  $: refitMainPanel(isMinimised, $panelstore)

  function refitMainPanel (_isMinimised: boolean, panelState: { panel?: { refit?: () => void } }): void {
    panelState.panel?.refit?.()
  }
</script>

<div
  id="sidebar"
  class="antiPanel-application vertical sidebar-container"
  class:mini={isMinimised || $sidebarStore.float}
>
  {#if isMinimised}
    <SidebarMini widgets={shownWidgets} {preferences} />
  {:else if $sidebarStore.variant === SidebarVariant.EXPANDED}
    <SidebarExpanded widgets={shownWidgets} {preferences} />
  {/if}
  <BugReport />
</div>

<style>
  .sidebar-container {
    position: relative;
    overflow: hidden;
    flex-direction: row;
    min-width: 25rem;
    border-radius: 0 var(--medium-BorderRadius) var(--medium-BorderRadius) 0;
    border-bottom: 1px solid transparent;
  }

  .sidebar-container.mini {
    justify-content: flex-end;
    width: calc(3.5rem + 1px) !important;
    min-width: calc(3.5rem + 1px) !important;
    max-width: calc(3.5rem + 1px) !important;
  }

  .sidebar-container:not(.mini) :global(.sidebar-content) {
    animation: servone-sidebar-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-container:not(.mini) :global(.sidebar-content) {
      animation: none;
    }
  }

  @media (max-width: 1024px) {
    .sidebar-container {
      width: 100%;
      border-left-color: transparent;
    }
  }

  @media (max-width: 480px) {
    :global(.mobile-theme) .sidebar-container {
      border-right: none !important;
      border-bottom-right-radius: 0 !important;
    }
  }

  @keyframes -global-servone-sidebar-in {
    from {
      opacity: 0;
      transform: translateX(1rem);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
