<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import login, { loginId } from '@hcengineering/login'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery, getClient, isDisabled } from '@hcengineering/presentation'
  import setting, { SettingsEvents, settingId, type SettingsCategory } from '@hcengineering/setting'
  import {
    Component,
    IconInfo,
    IconLink,
    Label,
    NavGroup,
    NavItem,
    Scroller,
    Separator,
    defineSeparators,
    deviceOptionsStore,
    deviceOptionsStore as deviceInfo,
    deviceWidths,
    getCurrentResolvedLocation,
    navigate,
    resolvedLocationStore,
    settingsSeparators,
    showPopup
  } from '@hcengineering/ui'
  import ui from '@hcengineering/ui/src/plugin'
  import { ChevronLeft } from '@lucide/svelte'
  import ThemeIcon from '@hcengineering/ui/src/components/internal/icons/Theme.svelte'
  import workbench, { type Widget } from '@hcengineering/workbench'
  import { NavFooter, closeWidget, logOut, minimizeSidebar, openWidget, sidebarStore } from '@hcengineering/workbench-resources'
  import { onDestroy, onMount } from 'svelte'
  import IconImport from '../import/IconImport.svelte'
  import ImportPage from '../import/ImportPage.svelte'
  import { isLegacyConfigCategory } from '../legacy-config'
  import settingPlg from '../plugin'
  import { clearSettingsStore, settingsStore } from '../store'
  import AiClients from './AiClients.svelte'
  import Appearance from './Appearance.svelte'
  import About from './About.svelte'

  export let workbenchWidth: number = 0

  const PASSWORD_CATEGORY_NAME = 'password'
  const SECURITY_CATEGORY_NAME = 'security'
  const IMPORT_PAGE_NAME = 'import'
  const NAVIGATOR_REVEAL_DELAY_MS = 500
  const NARROW_WIDTH_INDEX = 3

  const account = getCurrentAccount()
  const client = getClient()

  const SERVONE_PAGES = [
    {
      name: 'appearance',
      label: 'setting:string:ServoneAppearance' as IntlString,
      icon: ThemeIcon,
      page: Appearance
    },
    {
      name: 'aiClients',
      label: 'setting:string:ServoneAiClients' as IntlString,
      icon: IconLink,
      page: AiClients
    },
    {
      name: IMPORT_PAGE_NAME,
      label: 'setting:string:ServoneImport' as IntlString,
      icon: IconImport,
      page: ImportPage
    },
    {
      name: 'about',
      label: 'setting:string:ServoneAboutTitle' as IntlString,
      icon: IconInfo,
      page: About
    }
  ]

  const canUseImport = hasAccountRole(account, AccountRole.Maintainer)
  const servonePages = SERVONE_PAGES.filter((servonePage) => servonePage.name !== IMPORT_PAGE_NAME || canUseImport)
  const canInvite = hasAccountRole(account, AccountRole.User) && !isDisabled('invites')

  let allCategories: SettingsCategory[] = []
  let routeCategoryName: string | undefined
  let mainPanel: HTMLElement | undefined
  let isNarrow = false

  defineSeparators('setting', settingsSeparators)

  const categoriesQuery = createQuery()
  categoriesQuery.query(
    setting.class.SettingsCategory,
    {},
    (categories) => {
      allCategories = categories
    },
    { sort: { order: 1 } }
  )

  const unsubscribeLocation = resolvedLocationStore.subscribe((location) => {
    routeCategoryName = location.path[3]
  })

  $: accessibleCategories = allCategories.filter(
    (category) => hasAccountRole(account, category.role) && !isDisabled(category.feature)
  )
  $: navigatorCategories = accessibleCategories.filter(
    (category) => category.name !== PASSWORD_CATEGORY_NAME && !isLegacyConfigCategory(category.name)
  )
  $: isLegacyRoute = routeCategoryName !== undefined && isLegacyConfigCategory(routeCategoryName)
  $: selectedCategory = isLegacyRoute
    ? undefined
    : accessibleCategories.find((category) => category.name === routeCategoryName)
  $: activeServonePage = servonePages.find((servonePage) => servonePage.name === routeCategoryName)
  $: hasSelectedPage = selectedCategory?.component !== undefined || activeServonePage !== undefined

  $: isPhone = $deviceInfo.isMobile
  $: pageTitle = activeServonePage?.label ?? selectedCategory?.label
  $: isListShown = isPhone && !hasSelectedPage

  $: if ((isLegacyRoute || (!isPhone && routeCategoryName === undefined)) && accessibleCategories.length > 0) {
    redirectToDefaultCategory()
  }

  function redirectToDefaultCategory (): void {
    const location = getCurrentResolvedLocation()
    const routeName = location.path[3] ?? ''
    if (location.path[2] !== settingId || (routeName !== '' && !isLegacyConfigCategory(routeName))) return
    const defaultCategory =
      accessibleCategories.find((category) => category._id === setting.ids.Profile) ??
      accessibleCategories.find((category) => category.component !== undefined)
    if (defaultCategory === undefined) return
    location.path[3] = defaultCategory.name
    location.path.length = 4
    navigate(location, true)
  }

  function closePage (): void {
    clearSettingsStore()
    const location = getCurrentResolvedLocation()
    location.path.length = 3
    navigate(location)
  }

  function openPage (pageName: string): void {
    clearSettingsStore()
    const location = getCurrentResolvedLocation()
    if (location.path[3] === pageName) return
    location.path[3] = pageName
    location.path.length = 4
    navigate(location)
  }

  function isExpandableGroup (category: SettingsCategory): boolean {
    return category.expandable === true || (category.expandable === undefined && category._id === setting.ids.Setting)
  }

  function openWorkspaceList (): void {
    Analytics.handleEvent(SettingsEvents.SelectWorkspace)
    navigate({ path: [loginId, 'selectWorkspace'] })
  }

  function openInvitePopup (): void {
    Analytics.handleEvent(SettingsEvents.InviteToWorkspace)
    showPopup(login.component.InviteLink, {})
  }

  function signOut (): void {
    void logOut()
    navigate({ path: [loginId] })
    Analytics.handleEvent(SettingsEvents.SignOut)
    Analytics.logout()
  }

  onMount(() => {
    const hadNoCategoryAtMount = (getCurrentResolvedLocation().path[3] ?? '') === ''
    const revealTimer = setTimeout(() => {
      if (!hadNoCategoryAtMount) return
      deviceOptionsStore.update((options) => {
        options.navigator.visible = true
        return options
      })
    }, NAVIGATOR_REVEAL_DELAY_MS)
    return () => clearTimeout(revealTimer)
  })

  $: deviceOptionsStore.update((options) => {
    options.replacedPanel = mainPanel
    return options
  })

  $: asideComponent = $settingsStore.component ?? null
  $: asideProps = $settingsStore.props ?? null
  $: renderedAsideProps = asideProps ?? {}

  $: updateNarrowMode(workbenchWidth)

  function updateNarrowMode (width: number): void {
    const nextIsNarrow = width < deviceWidths[NARROW_WIDTH_INDEX]
    if (nextIsNarrow !== isNarrow) isNarrow = nextIsNarrow
  }

  $: settingsWidget = client
    .getModel()
    .findAllSync(workbench.class.Widget, { _id: settingPlg.ids.SettingsWidget })[0]

  $: syncSidebarWidget(isNarrow, asideComponent, settingsWidget, $sidebarStore.widget)

  function syncSidebarWidget (
    narrow: boolean,
    aside: typeof asideComponent,
    widget: Widget | undefined,
    shownWidgetId: string | undefined
  ): void {
    if (widget === undefined) return
    const isWidgetShown = shownWidgetId === widget._id
    if (narrow && aside !== null && !isWidgetShown) {
      openWidget(widget, { component: aside, ...asideProps }, { active: true, openedByUser: true })
    } else if (narrow && aside === null && isWidgetShown) {
      closeWidget(widget._id)
      minimizeSidebar()
    } else if (!narrow && aside !== null && isWidgetShown) {
      closeWidget(widget._id)
    }
  }

  onDestroy(() => {
    unsubscribeLocation()
    clearSettingsStore()
    deviceOptionsStore.update((options) => {
      options.replacedPanel = undefined
      return options
    })
  })
</script>

{#if isPhone ? isListShown : $deviceOptionsStore.navigator.visible}
  <div
    class="antiPanel-navigator settings-nav border-left"
    class:phone={isPhone}
    class:portrait={$deviceOptionsStore.navigator.direction === 'horizontal'}
    class:landscape={$deviceOptionsStore.navigator.direction !== 'horizontal'}
    class:border-right={!hasSelectedPage}
    class:fly={$deviceOptionsStore.navigator.float}
  >
    <div class="antiPanel-wrap__content hulyNavPanel-container settings-nav-content">
      <div class="hulyNavPanel-header"><Label label={setting.string.Settings} /></div>
      <div class="nav-list-wrapper">
        <Scroller shrink>
          {#each navigatorCategories as category (category._id)}
            {@const navigationComponent = category.extraComponents?.navigation}
            {#if navigationComponent !== undefined && isExpandableGroup(category)}
              <NavGroup
                _id={category._id}
                label={category.label}
                categoryName={category.name}
                highlighted={selectedCategory?._id === category._id}
                tools={category.extraComponents?.tools}
              >
                <Component is={navigationComponent} props={{ kind: 'navigation', categoryName: category.name }} />
              </NavGroup>
            {:else}
              <NavItem
                icon={category.icon}
                label={category.label}
                selected={selectedCategory?._id === category._id}
                on:click={() => openPage(category.name)}
              />
            {/if}
            {#if category.name === SECURITY_CATEGORY_NAME}
              {#each servonePages as servonePage (servonePage.name)}
                <NavItem
                  icon={servonePage.icon}
                  label={servonePage.label}
                  selected={routeCategoryName === servonePage.name}
                  on:click={() => openPage(servonePage.name)}
                />
              {/each}
            {/if}
          {/each}
        </Scroller>
      </div>
      <NavFooter split>
        <NavItem
          icon={setting.icon.SelectWorkspace}
          label={setting.string.SelectWorkspace}
          on:click={openWorkspaceList}
        />
        {#if canInvite}
          <NavItem
            icon={setting.icon.InviteWorkspace}
            label={setting.string.InviteWorkspace}
            on:click={openInvitePopup}
          />
        {/if}
        <NavItem icon={setting.icon.Signout} label={setting.string.Signout} on:click={signOut} />
      </NavFooter>
    </div>
    {#if !isPhone}
      <Separator
        name="setting"
        index={0}
        color="transparent"
        float={$deviceOptionsStore.navigator.float ? 'navigator' : true}
      />
    {/if}
  </div>
  {#if !isPhone}
    <Separator
      name="setting"
      index={0}
      color="transparent"
      separatorSize={0}
      short
      float={$deviceOptionsStore.navigator.float}
    />
  {/if}
{/if}

<div
  class="antiPanel-component filledNav settings-main-panel"
  class:border-right={!hasSelectedPage}
  class:phone-hidden={isListShown}
  style:flex-direction={isPhone ? 'column' : 'row'}
  bind:this={mainPanel}
>
  {#if isPhone}
    <div class="settings-back-bar">
      <button type="button" class="settings-back-button" on:click={closePage}>
        <ChevronLeft size={20} />
        <span class="settings-back-title">
          {#if pageTitle !== undefined}<Label label={pageTitle} />{:else}<Label label={ui.string.Back} />{/if}
        </span>
      </button>
    </div>
  {/if}
  <div class="settings-page-body" class:phone={isPhone}>
    {#if activeServonePage !== undefined}
      <svelte:component this={activeServonePage.page} />
    {:else if selectedCategory?.component !== undefined}
      <Component is={selectedCategory.component} props={{ kind: 'content' }} />
    {/if}
  </div>
</div>

{#if !isPhone && !isNarrow && asideComponent !== null}
  <Separator name="setting" index={1} color="transparent" separatorSize={0} short />
  <div class="hulySidePanel-container">
    {#key asideProps}
      {#if typeof asideComponent === 'string'}
        <Component is={asideComponent} props={{ ...renderedAsideProps }} />
      {:else}
        <svelte:component this={asideComponent} {...renderedAsideProps} />
      {/if}
    {/key}
  </div>
{/if}

<style lang="scss">
  .settings-nav-content :global(.antiNav-footer-grower) {
    flex: 0 0 0;
  }

  .settings-page-body:not(.phone) {
    display: contents;
  }

  .nav-list-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-height: 0;

    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 24px;
      pointer-events: none;
      background: linear-gradient(to bottom, transparent, var(--theme-navpanel-color));
    }
  }

  :global(#ui-root.mobile-theme) .settings-main-panel :global(.justify-between) {
    flex-wrap: wrap;
  }

  :global(#ui-root.mobile-theme) .settings-main-panel :global(.mx-auto.px-6) {
    padding-left: 16px;
    padding-right: 16px;
  }
</style>
