<script lang="ts">
  import { SortingOrder, type Ref } from '@hcengineering/core'
  import { getMetadata } from '@hcengineering/platform'
  import presentation, { createQuery, getClient, getFileUrl } from '@hcengineering/presentation'
  import { deviceOptionsStore as deviceInfo, getCurrentLocation, locationToUrl, showPanel, showPopup, tooltip } from '@hcengineering/ui'
  import { languageStore } from '@hcengineering/theme'
  import tracker, { type Issue } from '@hcengineering/tracker'
  import { Archive, ArrowLeft, Forward, MoreHorizontal, Reply, ReplyAll, SquareCheck, Star, Trash2 } from '@lucide/svelte'
  import { onDestroy, tick } from 'svelte'
  import { get } from 'svelte/store'
  import { MAIL_APP_ALIAS, MAIL_MESSAGE_CLASS, type MailFolderCard, type MailMessageCard, type MailThreadCard } from '@servone/mail'
  import * as DropdownMenu from '../../lib/components/ui/dropdown-menu'
  import { Button, buttonVariants } from '../../lib/components/ui/button'
  import { fetchBodyNow } from '../api'
  import { bodyCache, bodyStateOf, cacheBody, draftMessages, initiallyExpanded, latestNonDraftMessage, loadBody, readBodyResponse, nonDraftMessages } from '../lib/body'
  import type { ComposeMode } from '../lib/compose'
  import { openComposerPopup } from '../lib/compose-popup'
  import { archive, deleteThreads, folderLabel, moveTargets, moveTo, setRead, toggleStar } from '../lib/commands'
  import { continuedDraftMode } from '../lib/drafts'
  import { participantsLine } from '../lib/format'
  import { pendingSends } from '../lib/send'
  import { taskDescription, taskTitle } from '../lib/task'
  import { visibleThreads } from '../lib/threads'
  import { str, text } from '../plugin'
  import { getMailState } from '../state'
  import Composer from './Composer.svelte'
  import MessageItem from './MessageItem.svelte'

  export type DockedMode = Extract<ComposeMode, 'reply' | 'replyAll' | 'forward'>

  const client = getClient()
  const { account, folders, threads, openThread, thread, folder, undo, commands } = getMailState()

  $: currentThread = $openThread?._id === $thread ? $openThread : $threads?.find((candidate) => candidate._id === $thread)
  $: currentFolder = $folders?.find((candidate) => candidate._id === $folder)
  $: openTargets = currentThread !== undefined ? [currentThread._id] : []

  const messagesQuery = createQuery()
  let messages: MailMessageCard[] = []
  $: if ($thread !== undefined) {
    messagesQuery.query(MAIL_MESSAGE_CLASS, { mailThread: $thread }, (found) => {
      messages = [...found].sort((a, b) => a.mailSentAt - b.mailSentAt)
    })
  } else {
    messages = []
  }

  let expanded: ReadonlySet<Ref<MailMessageCard>> = new Set()
  let expandedForThread: Ref<MailThreadCard> | undefined
  $: readableMessages = nonDraftMessages(messages)
  $: drafts = draftMessages(messages).filter((candidate) => !$pendingSends.has(candidate._id))
  $: latestMessage = latestNonDraftMessage(messages)

  $: if ($thread !== expandedForThread && readableMessages.length > 0 && readableMessages[0].mailThread === $thread) {
    expanded = initiallyExpanded(readableMessages)
    expandedForThread = $thread
  }

  let dockedMode: DockedMode | undefined
  let continuedDraft: MailMessageCard | undefined
  let composerDraft: Ref<MailMessageCard> | undefined
  let dockedForThread: Ref<MailThreadCard> | undefined
  $: if ($thread !== dockedForThread) {
    dockedMode = undefined
    continuedDraft = undefined
    composerDraft = undefined
    dockedForThread = $thread
  }
  $: if (continuedDraft !== undefined && !drafts.some((candidate) => candidate._id === continuedDraft?._id)) {
    continuedDraft = undefined
  }

  function openReply (): void {
    openDocked('reply')
  }

  function openReplyAll (): void {
    openDocked('replyAll')
  }

  function openForward (): void {
    openDocked('forward')
  }

  function continueDraft (draft: MailMessageCard): void {
    dockedMode = undefined
    continuedDraft = draft
    composerDraft = undefined
    void revealComposer()
  }

  function closeDocked (): void {
    dockedMode = undefined
    continuedDraft = undefined
    composerDraft = undefined
  }

  export let onBack: (() => void) | undefined = undefined

  let isMounted = true
  onDestroy(() => { isMounted = false })

  function reopenSent (sent: MailMessageCard, mode: ComposeMode): void {
    if (isMounted && get(thread) === sent.mailThread) {
      continueDraft(sent)
      return
    }
    const owner = get(account)
    if (owner !== undefined && owner !== null) openComposerPopup(owner, get(languageStore), mode, sent)
  }

  function leaveThread (): void {
    if (onBack !== undefined) onBack()
    else thread.set(undefined)
  }

  export function openDocked (mode: DockedMode): void {
    continuedDraft = undefined
    composerDraft = undefined
    dockedMode = mode
    void revealComposer()
  }

  let composerSlot: HTMLElement | undefined

  async function revealComposer (): Promise<void> {
    await tick()
    composerSlot?.scrollIntoView({ block: 'nearest' })
  }

  function threadUrl (message: MailMessageCard): string {
    const loc = getCurrentLocation()
    const path = [...loc.path.slice(0, 2), MAIL_APP_ALIAS, message.mailThread]
    return new URL(locationToUrl({ path }), window.location.origin).href
  }

  function openCreateTaskPopup (): void {
    if (latestMessage === undefined) return
    const labels = { from: text('QuoteFrom'), date: text('QuoteDate'), subject: text('Subject'), openMail: text('OpenMail') }
    showPopup(tracker.component.CreateIssue, {
      space: undefined,
      relatedTo: latestMessage,
      initialTitle: taskTitle(latestMessage.title),
      initialDescription: taskDescription(latestMessage, threadUrl(latestMessage), labels, $languageStore),
      shouldSaveDraft: false
    }, 'top')
  }

  function toggleExpanded (id: Ref<MailMessageCard>): void {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expanded = next
  }

  async function fetchText (blob: string): Promise<string> {
    const response = await fetch(getFileUrl(blob), {
      headers: { Authorization: `Bearer ${getMetadata(presentation.metadata.Token) ?? ''}` }
    })
    return await readBodyResponse(response)
  }

  let readForThread: Ref<MailThreadCard> | undefined
  $: if (currentThread !== undefined && currentThread._id !== readForThread && currentFolder !== undefined) {
    readForThread = currentThread._id
    if (currentThread.mailHasUnread) {
      setRead(commands, [currentThread._id], true)
    }
  }

  let prefetchedFor: Ref<MailThreadCard> | undefined
  $: if (currentThread !== undefined && currentFolder !== undefined && currentThread._id !== prefetchedFor) {
    prefetchedFor = currentThread._id
    void prefetchNext(currentThread._id, currentFolder._id)
  }

  async function prefetchNext (currentId: Ref<MailThreadCard>, from: Ref<MailFolderCard>): Promise<void> {
    const visible = visibleThreads($threads ?? [], from, get(undo.hidden))
    const index = visible.findIndex((candidate) => candidate._id === currentId)
    const next = index === -1 ? undefined : visible[index + 1]
    if (next === undefined) return
    const nextMessages = await client.findAll(MAIL_MESSAGE_CLASS, { mailThread: next._id }, { sort: { mailSentAt: SortingOrder.Ascending } })
    const nextReadable = nonDraftMessages(nextMessages)
    if (nextReadable.length === 0) return
    const [expandedId] = initiallyExpanded(nextReadable)
    const target = nextReadable.find((candidate) => candidate._id === expandedId)
    if (target === undefined || bodyCache.has(target._id) || bodyStateOf(target) !== 'blob') return
    const state = await loadBody(target, fetchText, fetchBodyNow)
    if (state.kind === 'html') cacheBody(target._id, state.html)
  }

  const issuesQuery = createQuery()
  let taskChips: Array<Pick<Issue, '_id' | 'identifier' | 'title'>> = []
  $: if (messages.length > 0) {
    issuesQuery.query(
      tracker.class.Issue,
      { 'relations._id': { $in: messages.map((message) => message._id) } },
      (found) => { taskChips = found },
      { projection: { identifier: 1, title: 1 } }
    )
  } else {
    taskChips = []
  }

  function openTask (issue: Pick<Issue, '_id' | 'identifier' | 'title'>): void {
    showPanel(tracker.component.EditIssue, issue._id, tracker.class.Issue, 'content')
  }

  function metaParts (current: MailThreadCard, readable: MailMessageCard[], me: string): string[] {
    const parts = [participantsLine(current.mailParticipants, me, text('Me'))]
    if (current.mailHasAttachments) parts.push(text('Attachments', { count: readable.filter((message) => message.mailHasAttachments).length }))
    if (readable.length > 1) parts.push(text('MessageCount', { count: readable.length }))
    return parts
  }

  $: isMobile = $deviceInfo.isMobile
  $: folderName = currentFolder !== undefined ? folderLabel(text, currentFolder) : text('Mail')
</script>

{#if currentThread !== undefined}
  <section class="thread-view" aria-label={text('ReadingPane')}>
    <header class="thread-view__header">
      <div class="thread-view__toolbar">
        <button type="button" class="thread-view__back" aria-label={text('BackToFolder', { folder: folderName })} onclick={leaveThread}>
          <ArrowLeft size={16} />
          {#if !isMobile}
            <span class="thread-view__back-label">{folderName}</span>
          {/if}
        </button>
        <div class="thread-view__actions">
          {#if !isMobile}
            <Button size="sm" onclick={openCreateTaskPopup}>
              <SquareCheck size={16} />
              {text('CreateTask')}
            </Button>
            <Button size="sm" variant="outline" onclick={openReply}>
              <Reply size={16} />
              {text('Reply')}
            </Button>
          {/if}
          <div class="thread-view__icon-group">
            {#if isMobile}
              <button type="button" class="thread-view__icon-button" aria-label={text('Reply')} onclick={openReply}>
                <Reply size={16} />
              </button>
            {:else}
              <button type="button" class="thread-view__icon-button" aria-label={text('ReplyAll')} use:tooltip={{ label: str.ReplyAll }} onclick={openReplyAll}>
                <ReplyAll size={16} />
              </button>
              <button type="button" class="thread-view__icon-button" aria-label={text('Forward')} use:tooltip={{ label: str.Forward }} onclick={openForward}>
                <Forward size={16} />
              </button>
            {/if}
            <button type="button" class="thread-view__icon-button" aria-label={text('Archive')} use:tooltip={{ label: str.Archive }} onclick={() => { archive(commands, openTargets) }}>
              <Archive size={16} />
            </button>
            <button type="button" class="thread-view__icon-button thread-view__delete" aria-label={text('Delete')} use:tooltip={{ label: str.Delete }} onclick={() => { void deleteThreads(commands, openTargets) }}>
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              class="thread-view__icon-button"
              class:thread-view__icon-button--active={currentThread.mailIsStarred}
              aria-label={currentThread.mailIsStarred ? text('Unstar') : text('Star')}
              aria-pressed={currentThread.mailIsStarred}
              use:tooltip={{ label: currentThread.mailIsStarred ? str.Unstar : str.Star }}
              onclick={() => { toggleStar(commands, openTargets) }}
            >
              <Star size={16} fill={currentThread.mailIsStarred ? 'currentColor' : 'none'} />
            </button>
            <span use:tooltip={{ label: str.MoreActions }}>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label={text('MoreActions')}>
                  <MoreHorizontal size={16} />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  {#if isMobile}
                    <DropdownMenu.Item onSelect={openCreateTaskPopup}>{text('CreateTask')}</DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={openReplyAll}>{text('ReplyAll')}</DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={openForward}>{text('Forward')}</DropdownMenu.Item>
                    <DropdownMenu.Separator />
                  {/if}
                  <DropdownMenu.Item onSelect={() => { setRead(commands, openTargets, false) }}>{text('MarkUnread')}</DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Label>{text('MoveTo')}</DropdownMenu.Label>
                  {#each moveTargets($folders ?? [], $folder) as target (target._id)}
                    <DropdownMenu.Item onSelect={() => { moveTo(commands, openTargets, target) }}>{folderLabel(text, target)}</DropdownMenu.Item>
                  {/each}
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </span>
          </div>
        </div>
      </div>
      <h1 class="thread-view__subject">{currentThread.title}</h1>
      <div class="thread-view__meta">
        {#each metaParts(currentThread, readableMessages, $account?.mailEmail ?? '') as part, index (index)}
          {#if index > 0}<span aria-hidden="true">·</span>{/if}
          <span>{part}</span>
        {/each}
      </div>
      {#if taskChips.length > 0}
        <ul class="thread-view__tasks">
          {#each taskChips as issue (issue._id)}
            <li>
              <button type="button" class="thread-view__task-chip" onclick={() => { openTask(issue) }}>
                {issue.identifier} · {issue.title}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </header>
    <div class="thread-view__messages">
      {#each readableMessages as message (message._id)}
        <MessageItem
          {message}
          isExpanded={expanded.has(message._id)}
          onToggle={() => { toggleExpanded(message._id) }}
          {fetchText}
          fetchNow={fetchBodyNow}
        />
      {/each}
      {#each drafts as draft (draft._id)}
        {#if continuedDraft?._id !== draft._id && composerDraft !== draft._id}
          <article class="thread-view__draft" aria-label={text('Draft')}>
            <span class="thread-view__draft-label">{text('Draft')}</span>
            <span class="thread-view__draft-snippet">{draft.mailSnippet}</span>
            <Button size="sm" variant="outline" onclick={() => { continueDraft(draft) }}>{text('ContinueEditing')}</Button>
          </article>
        {/if}
      {/each}
    </div>
    <div class="thread-view__composer" bind:this={composerSlot}>
      {#if continuedDraft !== undefined && $account !== undefined && $account !== null}
        {#key continuedDraft._id}
          <Composer
            mode={continuedDraftMode(continuedDraft, latestMessage !== undefined)}
            parent={latestMessage}
            thread={$thread}
            draft={continuedDraft}
            docked={true}
            account={$account}
            lang={$languageStore}
            onClose={closeDocked}
            onReopen={reopenSent}
            onDraftCreated={(created) => { composerDraft = created }}
          />
        {/key}
      {:else if dockedMode !== undefined && latestMessage !== undefined && $account !== undefined && $account !== null}
        {#key dockedMode}
          <Composer
            mode={dockedMode}
            parent={latestMessage}
            thread={$thread}
            draft={undefined}
            docked={true}
            account={$account}
            lang={$languageStore}
            onClose={closeDocked}
            onReopen={reopenSent}
            onDraftCreated={(created) => { composerDraft = created }}
          />
        {/key}
      {/if}
    </div>
  </section>
{/if}

<style>
  /* Fills the pane so only the message list scrolls and the docked composer stays at the bottom. */
  .thread-view {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }
  .thread-view__composer:empty {
    display: none;
  }
  .thread-view__header {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .thread-view__toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .thread-view__subject {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.2px;
    text-wrap: balance;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--theme-caption-color);
  }
  .thread-view__back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 28px;
    padding: 0 8px 0 4px;
    border-radius: 8px;
    color: var(--muted-foreground);
    font-size: 13px;
    cursor: pointer;
  }
  .thread-view__back:hover {
    background: var(--theme-button-hovered);
    color: var(--theme-content-color);
  }
  .thread-view__back-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thread-view__actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin-left: auto;
  }
  .thread-view__icon-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .thread-view__icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--theme-content-color);
    cursor: pointer;
  }
  .thread-view__icon-button:hover {
    background: var(--theme-button-hovered);
  }
  .thread-view__icon-button--active {
    color: var(--primary);
  }
  .thread-view__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted-foreground);
    font-size: 13px;
  }
  .thread-view__tasks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }
  .thread-view__task-chip {
    padding: 4px 8px;
    border-radius: 8px;
    border: 1px solid var(--theme-divider-color);
    color: var(--theme-link-color);
    font-size: 12px;
  }
  .thread-view__task-chip:hover {
    background: var(--theme-button-hovered);
  }
  .thread-view__draft {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 12px;
    border: 1px dashed var(--theme-divider-color);
    border-radius: 8px;
    font-size: 14px;
  }
  .thread-view__draft-label {
    flex-shrink: 0;
    font-weight: 600;
    color: var(--muted-foreground);
  }
  .thread-view__draft-snippet {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted-foreground);
  }
  .thread-view__messages {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: auto;
    min-height: 0;
  }
</style>
