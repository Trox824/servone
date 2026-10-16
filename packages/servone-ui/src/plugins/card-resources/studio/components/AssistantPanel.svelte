<script lang="ts">
  import type { ConfigSnapshot } from '@servone/config'
  import { ArrowUp } from '@lucide/svelte'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Button } from '../../../../lib/components/ui/button'
  import { Textarea } from '../../../../lib/components/ui/textarea'
  import {
    canApply,
    canSend,
    draftStateOf,
    draftStateText,
    MAX_TEXT_CHARS,
    withDraftState,
    type AssistantDraft,
    type DraftState
  } from '../assistant'
  import { assistantChat as chat, sendQuestion } from '../assistant-chat'
  import { diffRows, riskLabel, riskTone } from '../diff'
  import type { StudioContext } from '../extensions'
  import { text, type StringKey } from '../strings'
  import { findType } from '../type-list'
  import PanelClose from './PanelClose.svelte'

  export let studio: StudioContext
  export let snapshot: ConfigSnapshot
  export let typeKey: string | undefined
  export let onClose: (() => void) | undefined = undefined

  const SUGGESTIONS = ['AssistantSuggestLeave', 'AssistantSuggestQuestion', 'AssistantSuggestCopy'] satisfies StringKey[]

  let question = ''
  let input: HTMLTextAreaElement | null = null

  $: openType = typeKey !== undefined ? findType(snapshot, typeKey) : undefined
  $: isSendable = canSend($chat, question)
  $: isEmpty = $chat.entries.length === 0 && !$chat.isSending

  async function send (): Promise<void> {
    if (!canSend($chat, question)) return
    const asked = question
    question = ''
    await sendQuestion(asked, typeKey)
  }

  async function apply (draft: AssistantDraft): Promise<void> {
    chat.update((current) => withDraftState(current, draft.id, 'applying'))
    let next: DraftState = 'failed'
    try {
      next = draftStateOf(await studio.applyDraft(draft.id))
    } finally {
      chat.update((current) => withDraftState(current, draft.id, next))
    }
  }

  function suggest (key: StringKey): void {
    question = text(key)
    input?.focus()
  }

  function onKeydown (event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    void send()
  }

  function reveal (node: HTMLElement): void {
    node.scrollIntoView({ block: 'nearest' })
  }
</script>

<div class="assistant" data-id="studio-assistant">
  <header class="assistant-head">
    <div class="grid min-w-0 gap-0.5">
      {#if openType !== undefined}
        <span class="assistant-caption truncate">{text('AssistantOpenType', { name: openType.name })}</span>
      {/if}
      <h2 class="m-0 text-base font-semibold">{text('Assistant')}</h2>
    </div>
    {#if onClose !== undefined}<PanelClose {onClose} />{/if}
  </header>
  <div class="assistant-log">
    {#if isEmpty}
      <div class="grid gap-3">
        <p class="m-0 text-sm text-muted-foreground">{text('AssistantIntro')}</p>
        <div class="grid gap-2">
          <span class="assistant-caption">{text('AssistantSuggestTitle')}</span>
          {#each SUGGESTIONS as key (key)}
            <button
              type="button"
              class="assistant-suggestion"
              data-id="studio-assistant-suggestion"
              on:click={() => {
                suggest(key)
              }}>{text(key)}</button
            >
          {/each}
        </div>
      </div>
    {/if}
    {#each $chat.entries as entry (entry.id)}
      <div class="assistant-entry" class:is-user={entry.role === 'user'} data-id={`studio-assistant-${entry.role}`} use:reveal>
        <span class="sr-only">{entry.role === 'user' ? text('AssistantYou') : text('AssistantName')}</span>
        {#if entry.text !== ''}
          <p class="assistant-text">{entry.text}</p>
        {/if}
        {#if entry.note !== undefined}
          <p class="assistant-caption m-0">{entry.note}</p>
        {/if}
        {#each entry.drafts as planned (planned.draft.id)}
          <div class="assistant-plan" data-id="studio-assistant-plan">
            <div class="flex items-start justify-between gap-2">
              <span class="min-w-0 text-sm font-medium break-words">{planned.draft.summary}</span>
              <Badge variant={riskTone(planned.draft.risk)}>{riskLabel(planned.draft.risk)}</Badge>
            </div>
            <ul class="m-0 grid list-none gap-1 p-0">
              {#each diffRows(planned.draft.diff) as row}
                <li class="flex items-start justify-between gap-2 text-xs">
                  <span class="min-w-0 break-words">{row.text}</span>
                  {#if row.affectedText !== undefined}
                    <Badge variant="destructive">{row.affectedText}</Badge>
                  {/if}
                </li>
              {/each}
            </ul>
            {#if canApply(planned.state)}
              <Button
                class="justify-self-start"
                data-id="studio-assistant-apply"
                onclick={() => {
                  void apply(planned.draft)
                }}>{text('AssistantApply')}</Button
              >
            {:else}
              <p class="assistant-caption m-0" data-id="studio-assistant-plan-state">{draftStateText(planned.state)}</p>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
    {#if $chat.isSending}
      <p class="m-0 text-sm text-muted-foreground" data-id="studio-assistant-thinking" use:reveal>{text('AssistantThinking')}</p>
    {/if}
    {#if $chat.error !== undefined}
      <p class="m-0 text-sm text-destructive" data-id="studio-assistant-error" use:reveal>{$chat.error}</p>
    {/if}
  </div>
  <form
    class="assistant-composer"
    on:submit|preventDefault={() => {
      void send()
    }}
  >
    <Textarea
      class="max-h-40 min-h-8 resize-none py-1.5"
      data-id="studio-assistant-input"
      bind:ref={input}
      bind:value={question}
      placeholder={text('AssistantPlaceholder')}
      aria-label={text('AssistantPlaceholder')}
      maxlength={MAX_TEXT_CHARS}
      rows={1}
      onkeydown={onKeydown}
    />
    <Button data-track="studio.assistant.send" type="submit" size="icon" disabled={!isSendable} aria-label={text('AssistantSend')} data-id="studio-assistant-send">
      <ArrowUp />
    </Button>
  </form>
</div>

<style>
  .assistant {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    text-align: left;
  }
  .assistant-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 16px 16px 12px;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .assistant-caption {
    color: var(--theme-halfcontent-color);
    font-size: 12px;
  }
  .assistant-log {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    overflow-y: auto;
    padding: 16px;
  }
  .assistant-suggestion {
    padding: 8px 12px;
    border: 1px solid var(--theme-divider-color);
    border-radius: 8px;
    color: var(--theme-caption-color);
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
  }
  .assistant-suggestion:hover {
    background: var(--theme-button-default);
  }
  .assistant-entry {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .assistant-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .assistant-entry.is-user {
    justify-items: end;
  }
  .assistant-entry.is-user .assistant-text {
    max-width: 85%;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--theme-button-default);
  }
  .assistant-plan {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--theme-divider-color);
    border-radius: 8px;
  }
  .assistant-composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--theme-divider-color);
  }
</style>
