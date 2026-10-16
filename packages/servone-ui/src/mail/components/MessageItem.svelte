<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { themeStore, ticker } from '@hcengineering/ui'
  import { ChevronDown } from '@lucide/svelte'
  import type { MailMessageCard } from '@servone/mail'
  import { displayName, fullTime, listTime, parseAddress, recipientNames } from '../lib/format'
  import { text } from '../plugin'
  import { getMailState } from '../state'
  import AttachmentChips from './AttachmentChips.svelte'
  import MessageBody from './MessageBody.svelte'

  export let message: MailMessageCard
  export let isExpanded: boolean
  export let onToggle: () => void
  export let fetchText: (blob: string) => Promise<string>
  export let fetchNow: (id: Ref<MailMessageCard>) => Promise<void>

  $: time = listTime(message.mailSentAt, $ticker, $themeStore.language)
  $: sentTitle = fullTime(message.mailSentAt, $themeStore.language)
  $: sender = parseAddress(message.mailFrom)

  const { account } = getMailState()
  let isRecipientsOpen = false
  $: recipients = recipientNames([...message.mailTo, ...message.mailCc], $account?.mailEmail ?? '', text('Me'))
  $: recipientSummary = recipients.every((name) => name === text('Me')) ? text('ToMe') : text('ToNames', { names: recipients.join(', ') })
</script>

{#if !isExpanded}
  <article aria-labelledby="message-heading-{message._id}">
    <h2 id="message-heading-{message._id}" class="sr-only">{displayName(message.mailFrom)}, {time}</h2>
    <button type="button" class="message-item message-item--collapsed" onclick={onToggle} aria-expanded="false">
      <span class="message-item__sender">{displayName(message.mailFrom)}</span>
      <span class="message-item__snippet">{message.mailSnippet}</span>
      <span class="message-item__time">{time}</span>
    </button>
  </article>
{:else}
  <article class="message-item message-item--expanded" aria-labelledby="message-heading-{message._id}">
    <div class="message-item__header">
      <div class="message-item__sender-line">
        <h2 id="message-heading-{message._id}" class="message-item__sender">
          <button type="button" class="message-item__toggle" aria-expanded="true" onclick={onToggle}>
            {sender.name !== '' ? sender.name : sender.email}<span class="sr-only">, {time}</span>
          </button>
        </h2>
        {#if sender.name !== ''}
          <span class="message-item__address">{sender.email}</span>
        {/if}
      </div>
      <time class="message-item__time" datetime={new Date(message.mailSentAt).toISOString()} title={sentTitle}>{time}</time>
    </div>
    {#if recipients.length > 0}
      <div class="message-item__recipients">
        <span class="message-item__recipients-summary">{recipientSummary}</span>
        <button
          type="button"
          class="message-item__recipients-toggle"
          class:message-item__recipients-toggle--open={isRecipientsOpen}
          aria-expanded={isRecipientsOpen}
          aria-controls="message-recipients-{message._id}"
          aria-label={text('ShowRecipients')}
          onclick={() => { isRecipientsOpen = !isRecipientsOpen }}
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {#if isRecipientsOpen}
        <div id="message-recipients-{message._id}" class="message-item__recipients-full">
          <div>{text('To')}: {message.mailTo.join(', ')}</div>
          {#if message.mailCc.length > 0}
            <div>{text('Cc')}: {message.mailCc.join(', ')}</div>
          {/if}
        </div>
      {/if}
    {/if}
    <MessageBody {message} {fetchText} {fetchNow} />
    <AttachmentChips messageId={message._id} />
  </article>
{/if}

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .message-item--collapsed {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 12px;
    width: 100%;
    border-radius: 8px;
    text-align: left;
    font: 14px/1.4 var(--font-family);
    color: var(--theme-content-color);
  }
  .message-item--collapsed:hover {
    background: var(--theme-button-hovered);
  }
  .message-item--collapsed .message-item__sender {
    flex-shrink: 0;
    font-weight: 600;
  }
  .message-item--collapsed .message-item__snippet {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted-foreground);
  }
  .message-item--expanded {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--theme-divider-color);
    border-radius: 8px;
  }
  .message-item__header {
    position: relative;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .message-item__toggle {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  /* The heading holds the button, so it stretches over the whole header row to keep the full row clickable. */
  .message-item__toggle::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  .message-item__sender-line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .message-item__sender {
    margin: 0;
    font-weight: 600;
    font-size: inherit;
    color: var(--theme-caption-color);
  }
  .message-item__address {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted-foreground);
    font-size: 13px;
  }
  /* Positioned so it sits above the header's click overlay and its title tooltip can show. */
  .message-item__time {
    position: relative;
    flex-shrink: 0;
    color: var(--muted-foreground);
    font-size: 13px;
  }
  .message-item__recipients {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    color: var(--muted-foreground);
    font-size: 13px;
  }
  .message-item__recipients-summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .message-item__recipients-toggle {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    color: var(--muted-foreground);
    cursor: pointer;
  }
  .message-item__recipients-toggle:hover {
    background: var(--theme-button-hovered);
  }
  .message-item__recipients-toggle--open :global(svg) {
    transform: rotate(180deg);
  }
  .message-item__recipients-full {
    color: var(--muted-foreground);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
</style>
