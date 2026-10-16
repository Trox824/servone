<!--
  Status-bar cluster replacing rail buttons hidden by rail.css (office, inbox).
  No help or settings button: both live in the account menu; help upstream opens Huly's Slack.
  Order must stay the highest position="right" entry (see install.ts).
-->
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { Bell, WifiOff } from '@lucide/svelte'
  import { createNotificationsQuery, onCommunicationClient } from '@hcengineering/presentation'
  import notification, { type DocNotifyContext, type InboxNotification } from '@hcengineering/notification'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import { translateCB, getResource, type IntlString } from '@hcengineering/platform'
  import { type Ref } from '@hcengineering/core'
  import { themeStore } from '@hcengineering/theme'
  import { Label, getCurrentLocation, location, navigate, tooltip } from '../original'

  let hasUnreadInbox = false
  let notificationCountQuery: ReturnType<typeof createNotificationsQuery> | undefined
  onCommunicationClient(() => {
    try {
      notificationCountQuery = createNotificationsQuery(true)
      notificationCountQuery.query({ read: false, limit: 1 }, (res) => {
        hasUnreadInbox = res.getResult().length > 0
      })
    } catch (e) {
      console.error('servone-top-right: inbox notification query failed', e)
    }
  })
  onDestroy(() => {
    notificationCountQuery?.unsubscribe()
  })

  let hasLegacyUnreadInbox = false
  const legacyInboxClient = InboxNotificationsClientImpl.getClient()
  const legacyInboxNotificationsByContextStore = legacyInboxClient.inboxNotificationsByContext
  let hasLegacyUnreadInboxFn:
  | ((data: Map<Ref<DocNotifyContext>, InboxNotification[]>) => Promise<boolean>)
  | undefined
  void getResource(notification.function.HasInboxNotifications).then((f) => {
    hasLegacyUnreadInboxFn = f
  })
  $: void hasLegacyUnreadInboxFn?.($legacyInboxNotificationsByContextStore).then((res) => {
    hasLegacyUnreadInbox = res
  })
  $: showUnreadInboxDot = hasUnreadInbox || hasLegacyUnreadInbox

  let currentApp: string | undefined
  $: currentApp = $location.path[2]

  function goTo (alias: string): void {
    const loc = getCurrentLocation()
    loc.path[2] = alias
    loc.path.length = 3
    loc.fragment = undefined
    loc.query = undefined
    navigate(loc)
  }

  const itemClass =
    'relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const selectedClass = 'bg-foreground/[0.07] text-foreground'

  let inboxLabel: string = ''
  $: translateCB(notification.string.Inbox, {}, $themeStore.language, (res) => { inboxLabel = res })

  const offlineLabel = 'ui:string:ServoneOffline' as IntlString
  let isOffline = !navigator.onLine
</script>

<svelte:window
  on:online={() => { isOffline = false }}
  on:offline={() => { isOffline = true }}
/>

<div class="flex items-center gap-0.5" style:-webkit-app-region={'no-drag'}>
  <!-- Region stays mounted so screen readers announce the text when it appears. -->
  <span role="status" class="inline-flex">
    {#if isOffline}
      <span class="mr-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground">
        <WifiOff size={14} class="shrink-0 text-amber-600" aria-hidden="true" />
        <!-- Text would crowd the centred search pill on narrow windows; the icon stays and screen readers keep the text. -->
        <span class="max-[1100px]:sr-only"><Label label={offlineLabel} /></span>
      </span>
    {/if}
  </span>
  <button
    type="button"
    class="{itemClass} {currentApp === 'inbox' ? selectedClass : ''}"
    use:tooltip={{ label: notification.string.Inbox }}
    aria-label={inboxLabel}
    on:click={() => goTo('inbox')}
  >
    <Bell size={18} />
    {#if showUnreadInboxDot}
      <span class="absolute right-1 top-1 size-1.5 rounded-full bg-red-500" />
    {/if}
  </button>
</div>
