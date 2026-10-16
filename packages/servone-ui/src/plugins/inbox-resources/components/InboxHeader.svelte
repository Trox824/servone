<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { SortingOrder } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import { Label, Loading, closePanel } from '@hcengineering/ui'
  import { CheckCheck, Ellipsis, Eye, EyeOff, Trash2 } from '@lucide/svelte'
  import { buttonVariants } from '../../../lib/components/ui/button'
  import * as DropdownMenu from '../../../lib/components/ui/dropdown-menu'
  import * as Tabs from '../../../lib/components/ui/tabs'
  import { clearAllInbox, confirmClearInbox, readAllInbox } from '../inbox-actions'
  import { closeDoc } from '../location'
  import inbox from '../plugin'
  import { hideUserNamesSettingId, isViewSettingEnabled, updateViewSetting, viewSettingsStore } from '../settings'
  import { loadedSources } from '../source-filter-state'
  import { ACTIVE_STATUS, REQUEST_CLASS, isApprovalsTab, waitingRequests } from './ApprovalsList.svelte'
  import SourceFilter from './SourceFilter.svelte'

  const allTabLabel = 'notification:string:ServoneInboxAll' as IntlString
  const waitingTabLabel = 'notification:string:ServoneInboxWaitingMe' as IntlString
  const moreActionsLabel = 'notification:string:ServoneInboxMore' as IntlString
  const showUserNamesLabel = 'notification:string:ServoneShowUserNames' as IntlString

  const waitingRequestsQuery = createQuery()
  waitingRequestsQuery.query(
    REQUEST_CLASS,
    { requested: getCurrentEmployee(), status: ACTIVE_STATUS },
    (requests) => {
      waitingRequests.set(requests)
    },
    { sort: { createdOn: SortingOrder.Descending } }
  )

  let isClearing = false
  let isReading = false

  async function readAll (): Promise<void> {
    if (isClearing || isReading) return
    isReading = true
    try {
      await readAllInbox()
      isReading = false
    } catch (error) {
      isReading = false
      Analytics.handleError(error)
    }
  }

  async function clearAll (): Promise<void> {
    if (isClearing || isReading) return
    isClearing = true
    try {
      await clearAllInbox()
      isClearing = false
    } catch (error) {
      isClearing = false
      Analytics.handleError(error)
    }
  }

  function switchTab (tabValue: string): void {
    const goesToApprovals = tabValue === 'approvals'
    if (goesToApprovals === $isApprovalsTab) return
    closePanel()
    closeDoc()
    isApprovalsTab.set(goesToApprovals)
  }

  $: isEmpty = $loadedSources.every((source) => source.count === 0)
  $: isHidingNames = isViewSettingEnabled($viewSettingsStore, hideUserNamesSettingId)
  $: activeTab = $isApprovalsTab ? 'approvals' : 'all'
</script>

<div class="hulyNavPanel-header withButton small inbox-header">
  <span class="overflow-label"><Label label={inbox.string.Inbox} /></span>
  <div class="flex-row-center flex-gap-2">
    {#if isClearing}
      <Loading size="small"><span class="busy-label"><Label label={inbox.string.Clearing} /></span></Loading>
    {:else if isReading}
      <Loading size="small"><span class="busy-label"><Label label={inbox.string.Reading} /></span></Loading>
    {/if}
    <span class:invisible={$isApprovalsTab} aria-hidden={$isApprovalsTab} inert={$isApprovalsTab}>
      <SourceFilter />
    </span>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
        <Ellipsis />
        <span class="sr-only"><Label label={moreActionsLabel} /></span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-56">
        {#if !isEmpty}
          <DropdownMenu.Item onSelect={() => { void readAll() }}>
            <CheckCheck />
            <Label label={inbox.string.ReadAll} />
          </DropdownMenu.Item>
        {/if}
        <DropdownMenu.Item onSelect={() => { updateViewSetting(hideUserNamesSettingId, !isHidingNames) }}>
          {#if isHidingNames}
            <Eye />
            <Label label={showUserNamesLabel} />
          {:else}
            <EyeOff />
            <Label label={inbox.string.HideUserNames} />
          {/if}
        </DropdownMenu.Item>
        {#if !isEmpty}
          <DropdownMenu.Separator />
          <DropdownMenu.Item variant="destructive" onSelect={() => { void confirmClearInbox(clearAll) }}>
            <Trash2 />
            <Label label={inbox.string.ClearAll} />
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</div>

<Tabs.Root value={activeTab} onValueChange={switchTab} class="border-b px-3 py-2">
  <Tabs.List class="w-full">
    <Tabs.Trigger value="all" class="px-2.5"><Label label={allTabLabel} /></Tabs.Trigger>
    <Tabs.Trigger value="approvals" class="px-2.5">
      <Label label={waitingTabLabel} />
      {#if $waitingRequests.length > 0}
        <span class="text-xs tabular-nums text-muted-foreground">{$waitingRequests.length}</span>
      {/if}
    </Tabs.Trigger>
  </Tabs.List>
</Tabs.Root>

<style>
  .inbox-header {
    background-color: var(--theme-popup-color);
    border-bottom: 1px solid var(--theme-navpanel-border);
  }

  .busy-label {
    margin-left: 0.25rem;
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor);
    text-transform: none;
  }
</style>
