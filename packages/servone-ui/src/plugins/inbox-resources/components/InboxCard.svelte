<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { createNotificationsQuery, createQuery, getClient } from '@hcengineering/presentation'
  import {
    Component,
    Icon,
    Label,
    Menu,
    Spinner,
    TimeSince,
    getEventPositionElement,
    showPopup,
    tooltip,
    type Action
  } from '@hcengineering/ui'
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { Archive } from '@lucide/svelte'
  import { AccountRole, type Doc, getCurrentAccount } from '@hcengineering/core'
  import notification, {
    type ActivityNotificationViewlet,
    type InboxNotification
  } from '@hcengineering/notification'
  import cardPlugin, { type Card } from '@hcengineering/card'
  import type { Notification } from '@hcengineering/communication-types'
  import view from '@hcengineering/view'
  import { ObjectIcon } from '@hcengineering/view-resources'
  import { Skeleton } from '../../../lib/components/ui/skeleton'
  import InboxCardTitle from './InboxCardTitle.svelte'
  import ModernPreview from './InboxNotification.svelte'
  import LegacyNotification from './legacy/LegacyNotification.svelte'
  import type { NavigationItem } from '../type'
  import type { NavigationClient } from '../client'
  import { setNavItemRead } from '../inbox-actions'
  import { isNotice } from '../notice'

  export let navClient: NavigationClient
  export let navItem: NavigationItem
  export let selected = false
  export let viewlets: ActivityNotificationViewlet[] = []

  const dispatch = createEventDispatcher<{
    doc: Doc | undefined
    select: { doc: Doc, notification?: InboxNotification | Notification }
  }>()

  const hierarchy = getClient().getHierarchy()
  const docQuery = createQuery()
  const legacyUnreadQuery = createQuery()
  const modernUnreadQuery = createNotificationsQuery()
  const canArchive = getCurrentAccount().role !== AccountRole.ReadOnlyGuest

  let loadedDoc: Doc | undefined
  let isLoading = true
  let isRemoving = false
  let unreadTotal = 0
  let archiveLabel = ''

  $: rowClass = navItem._class
  $: rowId = navItem._id
  $: rowType = navItem.type
  $: contextKey = navItem.type === 'modern' ? navItem.context.id : navItem.context._id

  $: if (loadedDoc !== undefined && loadedDoc._id !== rowId) {
    loadedDoc = undefined
    isLoading = true
  }

  $: docQuery.query(
    rowClass,
    { _id: rowId },
    (docs) => {
      loadedDoc = docs[0]
      isLoading = false
      dispatch('doc', loadedDoc)
    },
    { limit: 1 }
  )

  $: refreshUnreadTotal(rowType, contextKey)

  function refreshUnreadTotal (_rowType: string, _contextKey: string): void {
    if (navItem.type === 'modern') {
      legacyUnreadQuery.unsubscribe()
      modernUnreadQuery.query(
        { limit: 1, total: true, read: false, strict: true, contextId: navItem.context.id },
        (unreadPage) => {
          unreadTotal = unreadPage.getTotal()
        }
      )
    } else {
      modernUnreadQuery.unsubscribe()
      legacyUnreadQuery.query(
        notification.class.InboxNotification,
        { isViewed: false, docNotifyContext: navItem.context._id },
        (unreadPage) => {
          unreadTotal = unreadPage.total
        },
        { total: true, limit: 1 }
      )
    }
  }

  $: changeCount =
    navItem.type === 'modern' ? (navItem.context.notifications?.length ?? 0) : navItem.notifications.length
  $: newestModern = navItem.type === 'modern' ? navItem.context.notifications?.[0] : undefined
  $: newestLegacy = navItem.type === 'legacy' ? navItem.notifications[0] : undefined
  $: newestChange = newestModern ?? newestLegacy
  $: noticeIcon = newestLegacy !== undefined && isNotice(newestLegacy) ? newestLegacy.icon : undefined
  $: previewCard = loadedDoc as Card | undefined
  $: extraCount = changeCount - 1
  $: extraTitle = extraCount === 1 ? '1 more update' : `${extraCount} more updates`

  $: translateCB(view.string.Archive, {}, $themeStore.language, (text) => {
    archiveLabel = text
  })

  async function archiveRow (): Promise<void> {
    isRemoving = true
    try {
      await navClient.remove(navItem)
    } finally {
      isRemoving = false
    }
  }

  function openContextMenu (event: MouseEvent): void {
    if (!canArchive) return
    event.preventDefault()
    const isUnreadNow = unreadTotal > 0
    const actions: Action[] = [
      {
        label: (isUnreadNow ? 'notification:string:MarkAsRead' : 'notification:string:MarkAsUnread') as IntlString,
        icon: isUnreadNow ? view.icon.Eye : view.icon.EyeCrossed,
        action: async () => {
          await setNavItemRead(navItem, isUnreadNow)
        }
      },
      { label: view.string.Archive, icon: view.icon.CheckCircle, action: archiveRow }
    ]
    showPopup(Menu, { actions }, getEventPositionElement(event))
  }

  function selectRow (): void {
    if (loadedDoc === undefined) return
    dispatch('select', { doc: loadedDoc })
  }

  function selectPreview (event: MouseEvent): void {
    event.stopPropagation()
    event.preventDefault()
    if (loadedDoc === undefined || newestChange === undefined) return
    dispatch('select', { doc: loadedDoc, notification: newestChange })
  }

  const goneLabel = 'notification:string:ServoneCardGone' as IntlString
</script>

<div
  id={contextKey}
  class="inbox-card"
  class:selected
  class:unread={unreadTotal > 0}
  class:removing={isRemoving}
  role="option"
  aria-selected={selected}
  on:click={selectRow}
  on:contextmenu={openContextMenu}
>
  {#if isLoading}
    <div class="skeleton-stack">
      <Skeleton class="h-3 w-3/4" />
      <Skeleton class="h-3 w-1/2" />
    </div>
  {:else}
    <div class="row-line">
      {#if loadedDoc !== undefined}
        <span class="unread-dot"></span>
        <span class="icon-holder">
          {#if noticeIcon !== undefined}
            <Icon icon={noticeIcon} size="small" />
          {:else if hierarchy.isDerived(loadedDoc._class, cardPlugin.class.Card)}
            <Component is={cardPlugin.component.CardIcon} props={{ value: loadedDoc, size: 'small' }} />
          {:else}
            <ObjectIcon value={loadedDoc} size="small" showLoading={false} />
          {/if}
        </span>
        <span class="title-area">
          <InboxCardTitle doc={loadedDoc} {navItem} />
        </span>
        <span class="time-label">
          <TimeSince value={navItem.date.getTime()} />
        </span>
      {:else}
        <span class="gone-label">
          <Label label={goneLabel} />
        </span>
      {/if}
      {#if canArchive}
        <span class="archive-slot">
          {#if isRemoving}
            <Spinner size="small" />
          {:else}
            <button
              type="button"
              class="archive-button"
              aria-label={archiveLabel}
              use:tooltip={{ label: view.string.Archive }}
              on:click|stopPropagation={archiveRow}
            >
              <Archive size={14} strokeWidth={1.75} />
            </button>
          {/if}
        </span>
      {/if}
    </div>
    {#if loadedDoc !== undefined && newestChange !== undefined}
      <div class="preview-line">
        <div class="preview-holder" role="presentation" on:click={selectPreview}>
          {#if navItem.type === 'modern' && newestModern !== undefined && previewCard !== undefined}
            <ModernPreview notification={newestModern} card={previewCard} />
          {:else if newestLegacy !== undefined}
            <LegacyNotification notification={newestLegacy} doc={loadedDoc} {viewlets} />
          {/if}
        </div>
        {#if changeCount > 1}
          <span class="more-count" title={extraTitle}>+{extraCount}</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .inbox-card {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.25rem;
    box-sizing: border-box;
    height: 3.25rem;
    margin: 0 0.375rem;
    padding: 0 0.625rem 0 0.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .skeleton-stack {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .row-line,
  .preview-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    height: 1.25rem;
  }

  .unread-dot {
    flex-shrink: 0;
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: transparent;
  }

  .unread .unread-dot {
    background: var(--primary);
  }

  .icon-holder {
    display: flex;
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .title-area {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--foreground);
    font-size: 0.8125rem;
  }

  .title-area :global(.labels) {
    display: block;
    height: auto;
    min-height: 0;
    max-height: none;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .title-area :global(.labels *) {
    display: inline;
  }

  .title-area :global(.labels .title--bold) {
    margin-right: 0.375rem;
    font-weight: 500;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .title-area :global(.labels .title) {
    font-weight: 500;
    color: var(--foreground);
  }

  .unread .title-area :global(.labels .title) {
    font-weight: 600;
  }

  .gone-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--muted-foreground);
    font-size: 0.8125rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .time-label {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .archive-slot {
    display: none;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 1.5rem;
  }

  .inbox-card:hover .archive-slot,
  .inbox-card:focus-within .archive-slot,
  .inbox-card.selected .archive-slot,
  .inbox-card.removing .archive-slot {
    display: flex;
  }

  .inbox-card:hover .time-label,
  .inbox-card:focus-within .time-label,
  .inbox-card.selected .time-label,
  .inbox-card.removing .time-label {
    display: none;
  }

  .archive-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .archive-button:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .archive-button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .preview-line {
    padding-left: 2.375rem;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
  }

  .preview-holder {
    flex: 0 1 auto;
    min-width: 0;
    height: 1.25rem;
    overflow: hidden;
  }

  .preview-holder :global(.message-preview-template) {
    min-height: 0;
    height: 1.25rem;
    padding: 0;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
  }

  .preview-holder :global(.message-preview-template__person),
  .preview-holder :global(.message-preview-template__time) {
    display: none;
  }

  .preview-holder :global(.message-preview-template__content) {
    display: block;
    min-width: 0;
    color: var(--muted-foreground);
  }

  .preview-holder :global(.message-preview-template__content *) {
    display: inline;
  }

  .preview-holder :global(.message-preview-template__content .row > .header) {
    display: inline-flex;
    vertical-align: top;
    margin-right: 0.25rem;
  }

  .more-count {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
</style>
