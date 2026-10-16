<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { Ref } from '@hcengineering/core'
  import type {
    NotificationType,
    NotificationGroup,
    NotificationPreferencesGroup,
    NotificationTypeSetting
  } from '@hcengineering/notification'
  import { getResource, type IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import {
    Breadcrumb,
    defineSeparators,
    getCurrentResolvedLocation,
    Header,
    Loading,
    type Location,
    navigate,
    NavItem,
    resolvedLocationStore,
    Scroller,
    Separator,
    twoPanelsSeparators
  } from '@hcengineering/ui'
  import notification from '../../plugin'
  import NotificationGroupSetting from './NotificationGroupSetting.svelte'
  import { providersSettings, typesSettings } from '../../utils'

  const SHIPPED_GROUP_IDS: string[] = [
    'chunter:ids:ChunterNotificationGroup',
    'calendar:ids:CalendarNotificationGroup',
    'love:ids:LoveNotificationGroup',
    'tracker:ids:TrackerNotificationGroup',
    'document:ids:DocumentNotificationGroup',
    'gmail:ids:EmailNotificationGroup',
    'notification:ids:NotificationGroup',
    'request:ids:RequestNotificationGroup'
  ]
  const INBOX_GROUP_LABEL = 'notification:string:ServoneInboxGroup' as IntlString

  const model = getClient().getModel()
  const groups: NotificationGroup[] = model
    .findAllSync(notification.class.NotificationGroup, {})
    .filter((group) => SHIPPED_GROUP_IDS.includes(group._id))
  const preferencePages: NotificationPreferencesGroup[] = model.findAllSync(
    notification.class.NotificationPreferencesGroup,
    {}
  )

  let settingsByType = new Map<Ref<NotificationType>, NotificationTypeSetting[]>()
  let hasTypeSettings = false
  let hasProviderSettings = false
  let selectedGroupId: Ref<NotificationGroup> | undefined
  let selectedPage: NotificationPreferencesGroup | undefined

  defineSeparators('notificationSettings', twoPanelsSeparators)

  const stopTypeSettings = typesSettings.subscribe((typeSettings) => {
    const grouped = new Map<Ref<NotificationType>, NotificationTypeSetting[]>()
    for (const typeSetting of typeSettings) {
      const existing = grouped.get(typeSetting.type)
      if (existing === undefined) grouped.set(typeSetting.type, [typeSetting])
      else existing.push(typeSetting)
    }
    settingsByType = grouped
    hasTypeSettings = true
  })
  const stopProviderSettings = providersSettings.subscribe(() => {
    hasProviderSettings = true
  })
  const stopLocation = resolvedLocationStore.subscribe((location: Location) => {
    selectedGroupId = location.path[4] as Ref<NotificationGroup> | undefined
    selectedPage = undefined
  })

  onDestroy(() => {
    stopTypeSettings()
    stopProviderSettings()
    stopLocation()
  })

  $: isLoading = !hasTypeSettings || !hasProviderSettings

  $: if (selectedGroupId === undefined && selectedPage === undefined) {
    if (preferencePages.length > 0) selectedPage = preferencePages[0]
    else if (groups.length > 0) selectedGroupId = groups[0]._id
  }

  function selectPage (page: NotificationPreferencesGroup): void {
    selectedPage = page
    selectedGroupId = undefined
    const location = getCurrentResolvedLocation()
    location.path.length = 4
    navigate(location)
  }

  function selectGroup (groupId: Ref<NotificationGroup>): void {
    selectedGroupId = groupId
    selectedPage = undefined
    const location = getCurrentResolvedLocation()
    location.path[4] = groupId
    location.path.length = 5
    navigate(location)
  }
</script>

<div class="hulyComponent notify-settings">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={notification.icon.Notifications} label={notification.string.Notifications} size={'large'} isCurrent />
  </Header>
  <div class="hulyComponent-content__container columns">
    <div class="hulyComponent-content__column navigation py-2">
      <Scroller shrink>
        {#each preferencePages as page}
          <NavItem icon={page.icon} label={page.label} selected={selectedPage === page} on:click={() => selectPage(page)} />
        {/each}
        {#if preferencePages.length > 0 && groups.length > 0}
           <div class="antiNav-divider line"></div>
        {/if}
        {#each groups as group}
          <NavItem
            icon={group.icon}
            label={group._id === notification.ids.NotificationGroup ? INBOX_GROUP_LABEL : group.label}
            selected={selectedGroupId === group._id}
            on:click={() => selectGroup(group._id)}
          />
        {/each}
         <div class="antiNav-space"></div>
      </Scroller>
    </div>
    <Separator name={'notificationSettings'} index={0} color={'var(--theme-divider-color)'} />
    <div class="hulyComponent-content__column content">
      <Scroller align={'center'} padding={'var(--spacing-3)'} bottomPadding={'var(--spacing-3)'}>
        <div class="hulyComponent-content mx-auto w-full max-w-2xl">
          {#if isLoading}
            <Loading />
          {:else if selectedGroupId !== undefined}
            <NotificationGroupSetting group={selectedGroupId} settings={settingsByType} />
          {:else if selectedPage !== undefined}
            {#await getResource(selectedPage.presenter) then PageContent}
              <PageContent />
            {/await}
          {/if}
        </div>
      </Scroller>
    </div>
  </div>
</div>
