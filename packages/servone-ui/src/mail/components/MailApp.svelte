<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { defineSeparators, deviceOptionsStore as deviceInfo, getCurrentLocation, location, navigate, popupstore, Separator } from '@hcengineering/ui'
  import { languageStore } from '@hcengineering/theme'
  import { get } from 'svelte/store'
  import { MAIL_APP_ALIAS, type MailFolderCard, type MailThreadCard } from '@servone/mail'
  import { MailOpen, SquarePen, Trash2 } from '@lucide/svelte'
  import { onDestroy } from 'svelte'
  import { Skeleton } from '../../lib/components/ui/skeleton'
  import { archive, deleteThreads, folderLabel, toggleRead, toggleStar } from '../lib/commands'
  import { openNewMail } from '../lib/compose-popup'
  import { folderByRole } from '../lib/folders'
  import { commandFor, isShortcutBlocked, type MailCommand } from '../lib/keys'
  import { isSplitView, LIST_PANE_PX, LIST_SKELETON_ROWS } from '../lib/layout'
  import { openReconnect } from '../lib/reconnect'
  import { actionTargets, moveCursor, visibleThreads } from '../lib/threads'
  import { text } from '../plugin'
  import { createMailState, setMailState } from '../state'
  import AccountBanner from './AccountBanner.svelte'
  import ConnectScreen from './ConnectScreen.svelte'
  import EmptyPane from './EmptyPane.svelte'
  import MailNavigator from './MailNavigator.svelte'
  import ThreadList from './ThreadList.svelte'
  import ThreadView from './ThreadView.svelte'

  const NAVIGATOR_REM = 15 // the 240px folder column from the mail spec
  const FOLDER_SKELETON_ROWS = Array.from({ length: 6 }, (_, row) => row)

  const state = createMailState()
  setMailState(state)
  const { account, folders, threads, thread, folder, selection, undo, commands } = state

  let contentWidth = 0
  let hasDefaultedFolder = false
  let threadView: ThreadView | undefined
  let replacedPanel: HTMLElement | undefined
  let appElement: HTMLElement | undefined

  defineSeparators('mail', [
    { minSize: 12.5, size: NAVIGATOR_REM, maxSize: 22.5, float: 'navigator' },
    { size: 'auto', minSize: 20, maxSize: 'auto' }
  ])
  $: $deviceInfo.replacedPanel = replacedPanel
  onDestroy(() => ($deviceInfo.replacedPanel = undefined))

  $: isSplit = isSplitView(contentWidth)

  $: if ($account === null) {
    hasDefaultedFolder = false
    folder.set(undefined)
  }
  $: if (!hasDefaultedFolder && $account !== null && $account !== undefined && $folders !== undefined) {
    const inbox = folderByRole($folders, 'inbox')
    if (inbox !== undefined) {
      folder.set(inbox._id)
      hasDefaultedFolder = true
    }
  }

  $: currentFolder = $folders?.find((candidate) => candidate._id === $folder)

  $: pathThread = $location.path[2] === MAIL_APP_ALIAS ? (($location.path[3] as Ref<MailThreadCard> | undefined) ?? undefined) : undefined
  let appliedPathThread: Ref<MailThreadCard> | undefined
  $: if ($location.path[2] === MAIL_APP_ALIAS && pathThread !== appliedPathThread) {
    appliedPathThread = pathThread
    if (pathThread !== $thread) thread.set(pathThread)
  }
  $: if ($location.path[2] === MAIL_APP_ALIAS) writeThreadToLocation($thread)

  function writeThreadToLocation (nextThread: Ref<MailThreadCard> | undefined): void {
    const loc = getCurrentLocation()
    const current = loc.path[3] as Ref<MailThreadCard> | undefined
    if (current === nextThread) return
    appliedPathThread = nextThread
    if (nextThread !== undefined) {
      loc.path[3] = nextThread
      loc.path.length = 4
    } else {
      loc.path.length = 3
    }
    navigate(loc)
  }

  function backToList (): void {
    thread.set(undefined)
  }

  function handleBeforeUnload (): void {
    void undo.flush()
  }

  onDestroy(() => {
    void undo.flush()
  })

  function isBlockedTarget (target: EventTarget | null, key: string): boolean {
    if (!(target instanceof HTMLElement)) return false
    return isShortcutBlocked(target.tagName, target.getAttribute('role'), target.isContentEditable, key)
  }

  function moveAndOpen (step: 1 | -1): void {
    if ($folder === undefined || $threads === undefined) return
    const visible = visibleThreads($threads, $folder, get(undo.hidden))
    const next = moveCursor(visible, $selection, step)
    selection.set(next)
    if (next.cursor !== undefined) thread.set(next.cursor)
  }

  function composeCommand (): void {
    if ($account === undefined || $account === null) return
    openNewMail($account, $languageStore)
  }

  function openCommand (): void {
    if ($selection.cursor !== undefined) thread.set($selection.cursor)
  }

  function closeCommand (): void {
    if ($thread !== undefined) thread.set(undefined)
  }

  function runCommand (command: MailCommand): void {
    switch (command) {
      case 'next':
        moveAndOpen(1)
        break
      case 'prev':
        moveAndOpen(-1)
        break
      case 'archive':
        archive(commands, actionTargets($selection))
        break
      case 'delete':
        void deleteThreads(commands, actionTargets($selection))
        break
      case 'toggleUnread':
        toggleRead(commands, actionTargets($selection))
        break
      case 'toggleStar':
        toggleStar(commands, actionTargets($selection))
        break
      case 'reply':
        threadView?.openDocked('reply')
        break
      case 'replyAll':
        threadView?.openDocked('replyAll')
        break
      case 'forward':
        threadView?.openDocked('forward')
        break
      case 'compose':
        composeCommand()
        break
      case 'open':
        openCommand()
        break
      case 'close':
        closeCommand()
        break
    }
  }

  function isFocusInMail (target: EventTarget | null): boolean {
    return target === document.body || (target instanceof Node && appElement?.contains(target) === true)
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (!isFocusInMail(event.target)) return
    if (get(popupstore).length > 0) return
    if ($account?.mailStatus === 'removing') return
    const command = commandFor(event, isBlockedTarget(event.target, event.key))
    if (command === undefined) return
    event.preventDefault()
    runCommand(command)
  }
</script>

<svelte:window on:beforeunload={handleBeforeUnload} on:keydown={handleKeydown} />

<div class="mail-app" bind:this={appElement}>
  {#if $account === undefined}
    <div class="mail-app__grid" style="grid-template-columns: {NAVIGATOR_REM}rem {LIST_PANE_PX}px 1fr">
      <span class="sr-only" role="status">{text('LoadingList')}</span>
      <div class="mail-app__pane" aria-busy="true">
        {#each FOLDER_SKELETON_ROWS as row (row)}
          <Skeleton class="h-8 w-full" />
        {/each}
      </div>
      <div class="mail-app__pane" aria-busy="true">
        {#each LIST_SKELETON_ROWS as row (row)}
          <Skeleton class="h-10 w-full" />
        {/each}
      </div>
      <div class="mail-app__pane" aria-busy="true">
        <Skeleton class="h-6 w-1/2" />
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-full" />
      </div>
    </div>
  {:else if $account === null}
    <ConnectScreen />
  {:else if $account.mailStatus === 'removing'}
    <EmptyPane icon={Trash2} title={text('RemovingTitle', { email: $account.mailEmail })} lines={[text('RemovingHint')]} />
  {:else}
    <div class="hulyPanels-container mail-app__panels">
      {#if $deviceInfo.navigator.visible}
        <div
          class="antiPanel-navigator {$deviceInfo.navigator.direction === 'horizontal' ? 'portrait' : 'landscape'}"
          class:fly={$deviceInfo.navigator.float}
        >
          <div class="antiPanel-wrap__content hulyNavPanel-container">
            <MailNavigator account={$account} />
          </div>
          {#if !($deviceInfo.isMobile && $deviceInfo.isPortrait && $deviceInfo.minWidth)}
            <Separator name="mail" float={$deviceInfo.navigator.float ? 'navigator' : true} index={0} />
          {/if}
        </div>
        <Separator name="mail" float={$deviceInfo.navigator.float} index={0} color={'transparent'} separatorSize={0} short />
      {/if}
      <div class="hulyComponent mail-app__content" bind:this={replacedPanel} bind:clientWidth={contentWidth}>
        <AccountBanner account={$account} onReconnect={() => openReconnect($account)} />
        <div class="mail-app__grid" class:mail-app__grid--split={isSplit}>
          {#if isSplit || $thread === undefined}
            <div class="mail-app__pane mail-app__pane--list">
              <ThreadList />
            </div>
          {/if}
          {#if isSplit || $thread !== undefined}
            <div class="mail-app__pane mail-app__pane--thread">
              {#if $thread !== undefined}
                <ThreadView bind:this={threadView} onBack={isSplit ? undefined : backToList} />
              {:else}
                <EmptyPane
                  icon={MailOpen}
                  title={text('SelectThread')}
                  lines={[
                    text('UnreadInFolder', { count: currentFolder?.mailUnread ?? 0, folder: currentFolder !== undefined ? folderLabel(text, currentFolder) : '' }),
                    text('JkHint')
                  ]}
                />
              {/if}
            </div>
          {/if}
        </div>
        {#if $deviceInfo.isMobile && $thread === undefined}
          <button type="button" class="mail-app__compose-fab" aria-label={text('Compose')} onclick={composeCommand}>
            <SquarePen size={22} />
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* The workbench panel row sizes children to content; without flex: 1 the thread pane stopped at ~500px. */
  .mail-app {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    min-height: 0;
  }
  /* The workbench theme strips button outlines globally; mail is keyboard-driven and needs them back. */
  .mail-app :global(:is(button, a, [tabindex]):not([data-slot]):focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .mail-app :global([role='option'][tabindex]:focus-visible) {
    outline-offset: -2px;
  }
  .mail-app__panels {
    flex: 1;
  }
  /* chrome.css flattens the page card only when it is a direct child of contentPanel; .mail-app sits in between. */
  .mail-app__content {
    margin: 0;
    border: none;
    border-radius: 0;
  }
  .antiPanel-navigator ~ .mail-app__content {
    border-left: 1px solid var(--border);
  }
  .mail-app__grid {
    display: grid;
    flex: 1;
    grid-template-columns: 1fr;
    min-height: 0;
  }
  .mail-app__grid--split {
    grid-template-columns: 380px 1fr; /* LIST_PANE_PX in lib/layout.ts */
  }
  .mail-app__pane {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    padding: 8px;
    overflow: auto;
    border-right: 1px solid var(--theme-divider-color);
  }
  .mail-app__pane:last-child {
    border-right: none;
  }
  /* 4.25rem clears the phone bottom tab bar. */
  .mail-app__compose-fab {
    position: fixed;
    right: 16px;
    bottom: calc(4.25rem + 16px + env(safe-area-inset-bottom));
    z-index: 10;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: var(--primary);
    color: var(--primary-foreground);
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.18);
  }
</style>
