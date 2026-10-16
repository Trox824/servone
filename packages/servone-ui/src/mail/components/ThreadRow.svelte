<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Paperclip, Star } from '@lucide/svelte'
  import type { MailThreadCard } from '@servone/mail'
  import { Checkbox } from '../../lib/components/ui/checkbox'
  import { listTime, participantsLine } from '../lib/format'
  import { text } from '../plugin'

  export let thread: MailThreadCard
  export let picked: boolean
  export let isCursor: boolean
  export let isTabStop: boolean
  export let showCheckbox: boolean
  export let me: string
  export let lang: string
  export let now: number

  const dispatch = createEventDispatcher<{
    open: void
    toggle: void
    range: void
    star: void
  }>()

  $: participants = participantsLine(thread.mailParticipants, me, text('Me'))
  $: time = listTime(thread.mailLastMessageAt, now, lang)

  function onRowClick (event: MouseEvent): void {
    if (event.shiftKey) {
      dispatch('range')
      return
    }
    if (event.metaKey || event.ctrlKey) {
      dispatch('toggle')
      return
    }
    dispatch('open')
  }

  function onKeydown (event: KeyboardEvent): void {
    if (event.key === ' ') {
      event.preventDefault()
      dispatch('toggle')
    } else if (event.key === 'Enter') {
      event.preventDefault()
      dispatch('open')
    }
  }

  function onStarClick (event: MouseEvent): void {
    event.stopPropagation()
    dispatch('star')
  }
</script>

<div
  role="option"
  aria-selected={picked}
  aria-current={isCursor ? 'true' : undefined}
  tabindex={isTabStop ? 0 : -1}
  data-thread-id={thread._id}
  class="thread-row"
  class:thread-row--picked={picked}
  class:thread-row--cursor={isCursor}
  onclick={onRowClick}
  onkeydown={onKeydown}
>
  <span class="thread-row__lead">
    {#if showCheckbox || picked}
      <!-- An option must not hold tab stops; Space (pick) and s (star) reach these controls from the keyboard. -->
      <span class="thread-row__checkbox" onclick={(event) => event.stopPropagation()}>
        <Checkbox checked={picked} onCheckedChange={() => dispatch('toggle')} aria-label={text('SelectRow')} tabindex={-1} />
      </span>
    {:else if thread.mailHasUnread}
      <span class="thread-row__unread-dot" aria-hidden="true"></span>
    {/if}
    {#if thread.mailHasUnread}
      <span class="sr-only">{text('RowUnread')}</span>
    {/if}
  </span>
  <span class="thread-row__line">
    <span class="thread-row__participants" class:thread-row__participants--unread={thread.mailHasUnread}>{participants}</span>
    {#if thread.mailMessageCount > 1}
      <span class="thread-row__count">{thread.mailMessageCount}</span>
    {/if}
    {#if thread.mailHasAttachments}
      <Paperclip size={12} class="thread-row__attachment" aria-hidden="true" />
      <span class="sr-only">{text('RowHasAttachment')}</span>
    {/if}
    <span class="thread-row__time">{time}</span>
  </span>
  <span class="thread-row__line">
    <span class="thread-row__subject" class:thread-row__subject--unread={thread.mailHasUnread}>
      <span class="thread-row__subject-text">{thread.title}</span>
      {#if thread.mailSnippet !== ''}
        <span class="thread-row__snippet"> — {thread.mailSnippet}</span>
      {/if}
    </span>
    <button type="button" tabindex="-1" class="thread-row__star" class:thread-row__star--active={thread.mailIsStarred} onclick={onStarClick} aria-label={thread.mailIsStarred ? text('Unstar') : text('Star')}>
      <Star size={14} fill={thread.mailIsStarred ? 'currentColor' : 'none'} />
    </button>
    {#if thread.mailIsStarred}
      <span class="sr-only">{text('RowStarred')}</span>
    {/if}
  </span>
</div>

<style>
  /* Two lines: the list pane is 380px, too narrow for sender, subject and time on one line. */
  .thread-row {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    grid-template-rows: 20px 20px;
    align-items: center;
    column-gap: 4px;
    padding: 8px 8px 8px 4px;
    border-radius: 8px;
    cursor: pointer;
  }
  .thread-row:hover {
    background: var(--highlight-select-hover);
  }
  .thread-row--picked,
  .thread-row--cursor {
    background: var(--highlight-select);
    box-shadow: inset 0 0 0 1px var(--highlight-select-border);
  }
  .thread-row__lead {
    display: flex;
    grid-row: 1;
    align-items: center;
    justify-content: center;
  }
  .thread-row__checkbox {
    display: flex;
    align-items: center;
  }
  .thread-row__unread-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--primary);
  }
  .thread-row__line {
    display: flex;
    grid-column: 2;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .thread-row__participants {
    overflow: hidden;
    flex: 1;
    min-width: 0;
    color: var(--theme-content-color);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thread-row__participants--unread {
    font-weight: 600;
  }
  .thread-row__count {
    flex-shrink: 0;
    padding: 0 5px;
    border-radius: 4px;
    background: var(--theme-button-default);
    color: var(--muted-foreground);
    font-size: 12px;
    line-height: 16px;
  }
  .thread-row__time {
    flex-shrink: 0;
    color: var(--muted-foreground);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .thread-row__subject {
    overflow: hidden;
    flex: 1;
    min-width: 0;
    color: var(--muted-foreground);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thread-row__subject-text {
    color: var(--theme-content-color);
  }
  .thread-row__subject--unread .thread-row__subject-text {
    font-weight: 600;
  }
  .thread-row__star {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin: -2px 0;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--theme-halfcontent-color);
    cursor: pointer;
    opacity: 0;
  }
  .thread-row:hover .thread-row__star,
  .thread-row__star:focus-visible,
  .thread-row__star--active {
    opacity: 1;
  }
  .thread-row__star--active {
    color: var(--theme-warning-color);
  }
</style>
