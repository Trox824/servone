<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte'
  import type { Doc, Ref } from '@hcengineering/core'
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { Label, ListView, Loading, Scroller } from '@hcengineering/ui'
  import notification, {
    type ActivityNotificationViewlet,
    type DocNotifyContext,
    type InboxNotification,
    type Notification
  } from '@hcengineering/notification'
  import { getClient } from '@hcengineering/presentation'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import view from '@hcengineering/view'
  import inbox from '../plugin'
  import type { NavigationItem } from '../type'
  import { NavigationClient } from '../client'
  import InboxCard from './InboxCard.svelte'
  import { Button } from '../../../lib/components/ui/button'
  import { sourceCounts, visibleItems } from '../source-filter'
  import { setNavItemRead } from '../inbox-actions'
  import { inboxGroupOf, type InboxGroup } from '../notice'
  import { hiddenSources, isUnreadOnly, loadedSources } from '../source-filter-state'
  import ApprovalsList, { isApprovalsTab } from './ApprovalsList.svelte'

  export let doc: Doc | undefined = undefined
  export let legacyContext: DocNotifyContext | undefined = undefined

  const dispatch = createEventDispatcher<{
    select: { navItem: NavigationItem, doc: Doc, notification?: InboxNotification | Notification }
  }>()

  const PAGING_THRESHOLD_PX = 10
  const groupLabels: Record<InboxGroup, IntlString> = {
    today: 'notification:string:ServoneInboxToday' as IntlString,
    week: 'notification:string:ServoneInboxThisWeek' as IntlString,
    earlier: 'notification:string:ServoneInboxEarlier' as IntlString
  }
  const listAriaKey = 'notification:string:ServoneInboxList' as IntlString
  const allHiddenKey = 'notification:string:ServoneInboxAllHidden' as IntlString
  const showAllKey = 'notification:string:ServoneInboxShowAll' as IntlString

  const inboxClient = InboxNotificationsClientImpl.getClient()
  const notificationsByContext = inboxClient.inboxNotificationsByContext
  const navClient = new NavigationClient(inboxClient)
  const allRowsStore = navClient.navigationItemsStore
  const isClientLoadingStore = navClient.isLoadingStore

  let viewlets: ActivityNotificationViewlet[] = []
  void getClient()
    .findAll(notification.class.ActivityNotificationViewlet, {})
    .then((found) => {
      viewlets = found
    })

  let divScroll: HTMLElement | undefined | null = undefined
  let listView: ListView | undefined = undefined
  let listCursor = 0
  let isPageLoading = false
  let listAriaLabel = ''
  const reportedDocs = new Map<string, Doc>()

  function isRowUnread (row: NavigationItem, byContext: Map<Ref<DocNotifyContext>, InboxNotification[]>): boolean {
    if (row.type === 'legacy') {
      return (byContext.get(row.context._id) ?? []).some((entry) => !entry.isViewed)
    }
    return (row.context.notifications ?? []).some((entry) => !entry.read)
  }

  function isRowOpen (row: NavigationItem, contextId: string | undefined, docId: string | undefined): boolean {
    if (contextId !== undefined) return row.type === 'legacy' && row.context._id === contextId
    return docId !== undefined && row._id === docId
  }

  function rowKey (index: number): string {
    const row = shownRows[index]
    if (row === undefined) return String(index)
    if (row.type === 'legacy') return `${row.context._id}:${row._id}:${row.type}`
    return `${row._id}:${row.type}`
  }

  async function loadOlderPage (): Promise<void> {
    isPageLoading = true
    try {
      await navClient.prev()
    } finally {
      isPageLoading = false
    }
  }

  function handleScroll (): void {
    if (isPageLoading || !navClient.hasPrevPage() || divScroll == null) return
    const distanceToBottom = divScroll.scrollHeight - divScroll.scrollTop - divScroll.clientHeight
    if (distanceToBottom <= PAGING_THRESHOLD_PX) void loadOlderPage()
  }

  async function fillScreen (_rows: NavigationItem[]): Promise<void> {
    if ($hiddenSources.size === 0 && !$isUnreadOnly) return
    await tick()
    if (isPageLoading || !navClient.hasPrevPage()) return
    const overflows = divScroll != null && divScroll.scrollHeight - divScroll.clientHeight > PAGING_THRESHOLD_PX
    if (shownRows.length === 0 || !overflows) await loadOlderPage()
  }

  function moveCursor (step: number): void {
    const target = Math.max(0, Math.min(shownRows.length - 1, listCursor + step))
    listView?.select(target)
  }

  function handleKeydown (event: KeyboardEvent): void {
    const cursorRow: NavigationItem | undefined = shownRows[listCursor]
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.stopPropagation()
      event.preventDefault()
      moveCursor(event.key === 'ArrowUp' ? -1 : 1)
    } else if (event.code === 'KeyU' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (cursorRow === undefined) return
      event.preventDefault()
      void setNavItemRead(cursorRow, isRowUnread(cursorRow, $notificationsByContext))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const reportedDoc = cursorRow !== undefined ? reportedDocs.get(cursorRow._id) : undefined
      if (cursorRow !== undefined && reportedDoc !== undefined) {
        dispatch('select', { navItem: cursorRow, doc: reportedDoc })
      }
    }
  }

  function handleCardDoc (event: CustomEvent<Doc | undefined>): void {
    if (event.detail !== undefined) reportedDocs.set(event.detail._id, event.detail)
  }

  function handleCardSelect (
    event: CustomEvent<{ doc: Doc, notification?: InboxNotification | Notification }>,
    navItem: NavigationItem,
    index: number
  ): void {
    dispatch('select', { navItem, doc: event.detail.doc, notification: event.detail.notification })
    listCursor = index
  }

  function showAllRows (): void {
    hiddenSources.set(new Set())
    isUnreadOnly.set(false)
  }

  function focusOnMount (node: HTMLElement): void {
    node.focus()
  }

  $: allRows = $allRowsStore
  $: unreadVisibleRows = visibleItems(allRows, $hiddenSources)
  $: shownRows = $isUnreadOnly
    ? unreadVisibleRows.filter((row) => isRowUnread(row, $notificationsByContext))
    : unreadVisibleRows
  $: loadedSources.set(sourceCounts(allRows, $hiddenSources))
  $: rowGroups = shownRows.map((row) => inboxGroupOf(row.date, new Date()))
  $: openContextId = legacyContext?._id
  $: openDocId = doc?._id
  $: openIndex = shownRows.findIndex((row) => isRowOpen(row, openContextId, openDocId))
  $: translateCB(listAriaKey, {}, $themeStore.language, (text) => {
    listAriaLabel = text
  })
  $: void fillScreen(shownRows)
</script>

{#if $isApprovalsTab}
  <ApprovalsList {doc} />
{:else if shownRows.length > 0}
  <Scroller bind:divScroll padding={'0'} shrink onScroll={handleScroll}>
    <div
      class="inbox-list flex flex-col w-full pb-1.5 outline-none"
      role="listbox"
      aria-label={listAriaLabel}
      tabindex="0"
      use:focusOnMount
      on:keydown={handleKeydown}
    >
      <ListView
        bind:this={listView}
        bind:selection={listCursor}
        count={shownRows.length}
        items={shownRows}
        highlightIndex={openIndex}
        noScroll
        kind={'full-size'}
        colorsSchema={'lumia'}
        lazy
        minHeight={'3.25rem'}
        getKey={rowKey}
      >
        <svelte:fragment slot="item" let:item={rowIndex}>
          {#if shownRows[rowIndex] !== undefined}
            {@const row = shownRows[rowIndex]}
            {#if rowIndex === 0 || rowGroups[rowIndex] !== rowGroups[rowIndex - 1]}
              <div
                class="flex items-end h-8 pt-0 px-3.5 pb-1.5 text-xs font-medium text-[var(--muted-foreground)]"
                role="presentation"
              >
                <Label label={groupLabels[rowGroups[rowIndex]]} />
              </div>
            {/if}
            <InboxCard
              {navClient}
              navItem={row}
              {viewlets}
              selected={rowIndex === openIndex}
              on:doc={handleCardDoc}
              on:select={(event) => {
                handleCardSelect(event, row, rowIndex)
              }}
            />
          {/if}
        </svelte:fragment>
      </ListView>
    </div>
    {#if isPageLoading}
      <div
        class="w-full flex items-center justify-center text-center h-20 min-h-20 font-medium text-[var(--global-secondary-TextColor)]"
      >
        <Label label={view.string.Loading} />
      </div>
    {/if}
  </Scroller>
{:else if $isClientLoadingStore || isPageLoading}
  <div class="flex flex-col items-center justify-center text-center h-full w-full gap-2 px-6 self-center">
    <Loading />
  </div>
{:else if allRows.length > 0}
  <div class="flex flex-col items-center justify-center text-center h-full w-full gap-2 px-6 self-center">
    <Label label={allHiddenKey} />
    <Button variant="outline" size="sm" onclick={showAllRows}>
      <Label label={showAllKey} />
    </Button>
  </div>
{:else}
  <div class="flex flex-col items-center justify-center text-center h-full w-full gap-2 px-6 self-center">
    <span class="font-semibold"><Label label={inbox.string.InboxIsClear} /></span>
    <span class="max-w-80 text-[var(--theme-halfcontent-color)]">
      <Label label={inbox.string.YouDontHaveAnyNewMessages} />
    </span>
  </div>
{/if}

<style>
  .inbox-list :global(.list-item) {
    border-radius: 0;
  }

  .inbox-list :global(.list-container > div) {
    flex-shrink: 0;
  }

  .inbox-list:focus-visible :global(.list-item.selection .inbox-card) {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }
</style>
