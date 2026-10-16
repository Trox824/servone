<script lang="ts">
  import { tick } from 'svelte'
  import type { Ref } from '@hcengineering/core'
  import { deviceOptionsStore as deviceInfo, ticker, tooltip } from '@hcengineering/ui'
  import { languageStore } from '@hcengineering/theme'
  import { ChevronLeft, FolderInput, Inbox } from '@lucide/svelte'
  import type { MailThreadCard } from '@servone/mail'
  import { Checkbox } from '../../lib/components/ui/checkbox'
  import { Skeleton } from '../../lib/components/ui/skeleton'
  import * as DropdownMenu from '../../lib/components/ui/dropdown-menu'
  import { buttonVariants } from '../../lib/components/ui/button'
  import { archive, deleteThreads, folderLabel, moveTargets, moveTo, toggleRead, toggleStar } from '../lib/commands'
  import { listTime } from '../lib/format'
  import { LIST_SKELETON_ROWS } from '../lib/layout'
  import { actionTargets, moveCursor, pickRange, togglePicked, visibleThreads, type Selection } from '../lib/threads'
  import { getMailState } from '../state'
  import { str, text } from '../plugin'
  import BulkBar from './BulkBar.svelte'
  import EmptyPane from './EmptyPane.svelte'
  import ThreadRow from './ThreadRow.svelte'

  const LOAD_MORE_VIEWPORTS = 2

  const state = getMailState()
  const { account, folders, threads, folder, thread, selection, undo, commands, loadMoreThreads } = state

  let listElement: HTMLElement | undefined

  $: currentFolder = $folders?.find((candidate) => candidate._id === $folder)
  $: hidden = undo.hidden
  $: visible = $threads !== undefined && $folder !== undefined ? visibleThreads($threads, $folder, $hidden) : []
  $: moveFolders = moveTargets($folders ?? [], $folder)
  $: tabStopId = $selection.cursor ?? visible[0]?._id
  $: picked = $selection.picked
  $: targets = actionTargets($selection)
  $: allPicked = visible.length > 0 && visible.every((row) => picked.has(row._id))
  $: somePicked = picked.size > 0 && !allPicked
  $: anyUnread = visible.some((row) => picked.has(row._id) && row.mailHasUnread)
  $: anyUnstarred = visible.some((row) => picked.has(row._id) && !row.mailIsStarred)
  $: isTrash = currentFolder?.mailRole === 'trash'

  function showFolders (): void {
    $deviceInfo.navigator.visible = true
  }

  function toggleSelectAll (): void {
    if (allPicked) {
      selection.update((current) => ({ cursor: current.cursor, picked: new Set() }))
    } else {
      selection.update((current) => ({ cursor: current.cursor, picked: new Set(visible.map((row) => row._id)) }))
    }
  }

  function openThread (target: MailThreadCard): void {
    selection.update((current) => ({ cursor: target._id, picked: current.picked }))
    thread.set(target._id)
  }

  function toggleRow (target: Ref<MailThreadCard>): void {
    selection.update((current) => togglePicked({ ...current, cursor: target }, target))
  }

  function rangeToRow (target: Ref<MailThreadCard>): void {
    selection.update((current) => pickRange(visible, current, target))
  }

  function onListKeydown (event: KeyboardEvent): void {
    if (visible.length === 0) return
    let next: Selection | undefined
    if (event.key === 'ArrowDown') next = moveCursor(visible, $selection, 1)
    else if (event.key === 'ArrowUp') next = moveCursor(visible, $selection, -1)
    else if (event.key === 'Home') next = { cursor: visible[0]._id, picked: $selection.picked }
    else if (event.key === 'End') next = { cursor: visible[visible.length - 1]._id, picked: $selection.picked }
    if (next === undefined) return
    event.preventDefault()
    selection.set(next)
    void focusCursorRow(next.cursor)
  }

  async function focusCursorRow (cursor: Ref<MailThreadCard> | undefined): Promise<void> {
    if (cursor === undefined || listElement === undefined) return
    await tick()
    listElement.querySelector<HTMLElement>(`[data-thread-id="${CSS.escape(cursor)}"]`)?.focus()
  }

  $: void scrollToCursor($selection.cursor)
  async function scrollToCursor (cursor: Ref<MailThreadCard> | undefined): Promise<void> {
    if (cursor === undefined || listElement === undefined) return
    await tick()
    listElement.querySelector(`[data-thread-id="${CSS.escape(cursor)}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  function onListScroll (event: UIEvent & { currentTarget: HTMLElement }): void {
    const list = event.currentTarget
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight
    if (remaining < list.clientHeight * LOAD_MORE_VIEWPORTS) loadMoreThreads()
  }

</script>

<div class="thread-list">
  <div class="thread-list__header">
    {#if $deviceInfo.isMobile && $deviceInfo.navigator.available && !$deviceInfo.navigator.visible}
      <button type="button" class="thread-list__folders" aria-label={text('Folders')} onclick={showFolders}>
        <ChevronLeft size={20} />
      </button>
    {/if}
    <Checkbox checked={allPicked} indeterminate={somePicked} onCheckedChange={toggleSelectAll} aria-label={text('SelectAll')} />
    {#if picked.size > 0}
      <BulkBar
        count={picked.size}
        {anyUnread}
        {anyUnstarred}
        {isTrash}
        moveTargets={moveFolders}
        on:toggleRead={() => { toggleRead(commands, targets) }}
        on:toggleStar={() => { toggleStar(commands, targets) }}
        on:archive={() => { archive(commands, targets) }}
        on:delete={() => { void deleteThreads(commands, targets) }}
        on:moveTo={(event) => { moveTo(commands, targets, event.detail) }}
      />
    {:else}
      <span class="thread-list__title">{currentFolder !== undefined ? folderLabel(text, currentFolder) : ''}</span>
      {#if !$deviceInfo.isMobile}
        <span use:tooltip={{ label: str.MoveTo }}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label={text('MoveTo')} disabled={targets.length === 0}>
              <FolderInput size={16} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              {#each moveFolders as target (target._id)}
                <DropdownMenu.Item onSelect={() => { moveTo(commands, targets, target) }}>{folderLabel(text, target)}</DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </span>
      {/if}
    {/if}
  </div>
  <!-- No folder means no inbox yet (MailApp picks one only once it exists); that is the empty state, not loading. -->
  {#if $folder !== undefined && $threads === undefined}
    <div class="thread-list__loading" aria-busy="true">
      <span class="sr-only" role="status">{text('LoadingList')}</span>
      {#each LIST_SKELETON_ROWS as row (row)}
        <Skeleton class="h-10 w-full" />
      {/each}
    </div>
  {:else if visible.length === 0}
    <EmptyPane
      icon={Inbox}
      title={text('NoMail')}
      lines={[$account !== undefined && $account !== null && $account.mailLastSyncAt > 0 ? text('LastSynced', { time: listTime($account.mailLastSyncAt, $ticker, $languageStore) }) : text('NeverSynced')]}
    />
  {:else}
    <div class="thread-list__body" onscroll={onListScroll}>
    <div
      role="listbox"
      aria-label={currentFolder !== undefined ? folderLabel(text, currentFolder) : text('Mail')}
      aria-multiselectable="true"
      bind:this={listElement}
      onkeydown={onListKeydown}
    >
      {#each visible as row (row._id)}
        <ThreadRow
          thread={row}
          picked={picked.has(row._id)}
          isCursor={$selection.cursor === row._id && !$deviceInfo.isMobile}
          isTabStop={tabStopId === row._id}
          showCheckbox={picked.size > 0}
          me={$account?.mailEmail ?? ''}
          lang={$languageStore}
          now={$ticker}
          on:open={() => openThread(row)}
          on:toggle={() => toggleRow(row._id)}
          on:range={() => rangeToRow(row._id)}
          on:star={() => { toggleStar(commands, [row._id]) }}
        />
      {/each}
    </div>
    <!-- Sync imports BACKFILL_DAYS (services/servone/src/mail/sync.ts) of history; folder counts use the same window. -->
    <p class="thread-list__end">{text('OlderMailInProvider')}</p>
    </div>
  {/if}
</div>

<style>
  .thread-list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .thread-list__header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 8px;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .thread-list__folders {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    margin-left: -4px;
    border-radius: 8px;
    color: var(--theme-content-color);
  }
  .thread-list__title {
    flex: 1;
    color: var(--theme-caption-color);
    font-size: 14px;
    font-weight: 600;
  }
  .thread-list__end {
    margin: 0;
    padding: 16px 12px 24px;
    color: var(--theme-dark-color);
    font-size: 12px;
    text-align: center;
  }
  .thread-list__loading {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
  }
  .thread-list__body {
    /* Anchors the rows' absolute .sr-only labels; without it they stretch the pane and it scrolls into blank space. */
    position: relative;
    overflow: auto;
    flex: 1;
    min-height: 0;
    padding-top: 4px;
  }
</style>
