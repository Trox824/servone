<script lang="ts">
  import { onDestroy } from 'svelte'
  import { Bug, X } from '@lucide/svelte'
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { onClient } from '@hcengineering/presentation'
  import { languageStore } from '@hcengineering/theme'
  import * as Popover from '../lib/components/ui/popover'
  import { Label, tooltip } from '../original'
  import {
    BUG_REPORT_IMAGE_TYPES,
    BugReportError,
    MAX_BUG_REPORT_CHARS,
    MAX_BUG_REPORT_IMAGES,
    MAX_BUG_REPORT_IMAGE_BYTES,
    dismissBugCallout,
    isBugCalloutDismissed,
    sendBugReport,
    type BugReportFailure
  } from './bug-report'

  const SENT_CLOSE_MS = 3000
  const isMac = /Macintosh/i.test(navigator.userAgent)
  const titleLabel = 'ui:string:ServoneBugReportTitle' as IntlString
  const placeholderLabel = 'ui:string:ServoneBugReportPlaceholder' as IntlString
  const sentLabel = 'ui:string:ServoneBugReportSent' as IntlString
  const calloutLabel = 'ui:string:ServoneBugReportCallout' as IntlString
  const gotItLabel = 'ui:string:ServoneBugReportGotIt' as IntlString
  const sendLabel = 'ui:string:ServoneBugReportSend' as IntlString
  const sendingLabel = 'ui:string:ServoneBugReportSending' as IntlString
  const shortcutLabel = 'ui:string:ServoneBugReportShortcut' as IntlString
  const cancelLabel = 'ui:string:Cancel' as IntlString
  const imageLimitLabel = 'ui:string:ServoneBugReportImageLimit' as IntlString
  const removeImageLabel = 'ui:string:ServoneBugReportRemoveImage' as IntlString
  const failureLabels: Record<BugReportFailure, IntlString> = {
    rate_limited: 'ui:string:ServoneBugReportRateLimited' as IntlString,
    network: 'ui:string:ServoneBugReportNetwork' as IntlString,
    server: 'ui:string:ServoneBugReportServer' as IntlString
  }

  let account = ''
  let isCalloutDismissed = true
  onClient((_client, me) => {
    account = me.uuid
    isCalloutDismissed = isBugCalloutDismissed(me.uuid)
  })

  let isOpen = false
  let isSending = false
  let isSent = false
  let text = ''
  let screenshots: Array<{ file: File, url: string }> = []
  let isImageRejected = false
  let failure: BugReportFailure | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let title = ''
  let placeholder = ''
  let removeImage = ''
  let trigger: HTMLElement | null = null

  $: translateCB(titleLabel, {}, $languageStore, (translated) => { title = translated })
  $: translateCB(placeholderLabel, {}, $languageStore, (translated) => { placeholder = translated })
  $: translateCB(removeImageLabel, {}, $languageStore, (translated) => { removeImage = translated })
  $: canSend = text.trim() !== '' && !isSending && !isSent
  $: isCalloutShown = account !== '' && !isCalloutDismissed && !isOpen
  $: if (!isOpen) reset()

  function reset (): void {
    clearTimeout(closeTimer)
    if (isSent) {
      text = ''
      clearScreenshots()
    }
    isImageRejected = false
    isSent = false
    failure = undefined
  }

  function clearScreenshots (): void {
    for (const screenshot of screenshots) URL.revokeObjectURL(screenshot.url)
    screenshots = []
  }

  function removeScreenshot (index: number): void {
    URL.revokeObjectURL(screenshots[index].url)
    screenshots = screenshots.filter((_, position) => position !== index)
  }

  function onFieldPaste (event: ClipboardEvent): void {
    if (event.clipboardData === null || event.clipboardData.getData('text/plain') !== '') return
    const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
    if (pasted.length === 0) return
    event.preventDefault()
    const accepted = pasted
      .filter((file) => BUG_REPORT_IMAGE_TYPES.includes(file.type) && file.size > 0 && file.size <= MAX_BUG_REPORT_IMAGE_BYTES)
      .slice(0, MAX_BUG_REPORT_IMAGES - screenshots.length)
    isImageRejected = accepted.length < pasted.length
    screenshots = [...screenshots, ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) }))]
  }

  function dismissCallout (): void {
    isCalloutDismissed = true
    dismissBugCallout(account)
  }

  function onWindowKeydown (event: KeyboardEvent): void {
    if (!isOpen || event.key !== 'Escape') return
    event.stopPropagation()
    isOpen = false
  }

  function onFieldKeydown (event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(isMac ? event.metaKey : event.ctrlKey)) return
    event.preventDefault()
    void submit()
  }

  async function submit (): Promise<void> {
    if (!canSend) return
    isSending = true
    failure = undefined
    try {
      await sendBugReport(text.trim(), $languageStore, screenshots.map((screenshot) => screenshot.file))
      isSent = true
      closeTimer = setTimeout(() => { isOpen = false }, SENT_CLOSE_MS)
    } catch (error) {
      if (!(error instanceof BugReportError)) throw error
      failure = error.failure
    } finally {
      isSending = false
    }
  }

  onDestroy(() => {
    clearTimeout(closeTimer)
    clearScreenshots()
  })
</script>

<svelte:window on:keydown|capture={onWindowKeydown} />

<div class="bug-report">
  <Popover.Root bind:open={isOpen}>
    <span class="tip" use:tooltip={{ label: titleLabel, direction: 'left' }}>
      <Popover.Trigger bind:ref={trigger} class="servone-bug-trigger" aria-label={title}>
        <Bug size={16} />
      </Popover.Trigger>
    </span>
    <Popover.Content side="left" align="end" sideOffset={8} class="servone-float-panel servone-bug-panel" aria-label={title}>
      <form on:submit|preventDefault={submit}>
        <div class="servone-bug-title">{title}</div>
        {#if isSent}
          <p class="servone-bug-note" role="status"><Label label={sentLabel} /></p>
        {:else}
          <textarea
            class="servone-bug-field"
            bind:value={text}
            {placeholder}
            maxlength={MAX_BUG_REPORT_CHARS}
            aria-label={placeholder}
            on:keydown={onFieldKeydown}
            on:paste={onFieldPaste}
          ></textarea>
          {#if screenshots.length > 0}
            <div class="servone-bug-shots">
              {#each screenshots as screenshot, index (screenshot.url)}
                <div class="servone-bug-shot">
                  <img src={screenshot.url} alt="" />
                  <button type="button" class="servone-bug-shot-remove" aria-label={removeImage} on:click={() => { removeScreenshot(index) }}>
                    <X size={12} />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
          {#if isImageRejected}
            <p class="servone-bug-error" role="alert"><Label label={imageLimitLabel} params={{ count: MAX_BUG_REPORT_IMAGES }} /></p>
          {/if}
          {#if failure !== undefined}
            <p class="servone-bug-error" role="alert"><Label label={failureLabels[failure]} /></p>
          {/if}
          <div class="servone-bug-footer">
            <span class="servone-bug-hint"><Label label={shortcutLabel} params={{ key: isMac ? 'Cmd' : 'Ctrl' }} /></span>
            <button type="button" class="servone-bug-action quiet" on:click={() => { isOpen = false }}>
              <Label label={cancelLabel} />
            </button>
            <button type="submit" class="servone-bug-action primary" disabled={!canSend} aria-busy={isSending}>
              <Label label={isSending ? sendingLabel : sendLabel} />
            </button>
          </div>
        {/if}
      </form>
    </Popover.Content>
  </Popover.Root>
  <Popover.Root open={isCalloutShown} onOpenChange={(isCalloutOpen) => { if (!isCalloutOpen) dismissCallout() }}>
    <Popover.Content
      side="left"
      align="end"
      sideOffset={8}
      customAnchor={trigger}
      trapFocus={false}
      onOpenAutoFocus={(event) => { event.preventDefault() }}
      onCloseAutoFocus={(event) => { event.preventDefault() }}
      class="servone-float-panel servone-bug-panel servone-bug-callout"
      role="status"
    >
      <p class="servone-bug-note"><Label label={calloutLabel} /></p>
      <div class="servone-bug-footer">
        <button type="button" class="servone-bug-action primary" on:click={dismissCallout}>
          <Label label={gotItLabel} />
        </button>
      </div>
    </Popover.Content>
  </Popover.Root>
</div>

<style>
  .bug-report {
    position: absolute;
    right: calc((3.5rem - 2.25rem) / 2 + 1px);
    bottom: 1rem;
    z-index: 1;
  }
  .tip {
    display: inline-flex;
  }
  :global(.servone-bug-trigger) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--theme-navpanel-icons-color);
    cursor: pointer;
    outline: none;
    transition: color 120ms ease-out, background-color 120ms ease-out, transform 80ms ease-out;
  }
  :global(.servone-bug-trigger:hover),
  :global(.servone-bug-trigger[data-state='open']) {
    color: var(--theme-caption-color);
  }
  :global(.servone-bug-trigger[data-state='open']) {
    background-color: var(--theme-button-pressed);
  }
  :global(.servone-bug-trigger:active) {
    transform: translateY(1px);
  }
  :global(.servone-bug-trigger:focus-visible) {
    box-shadow: 0 0 0 2px var(--primary-button-outline);
  }
  :global(.servone-bug-panel) {
    gap: 0;
    width: min(22rem, calc(100vw - 6rem));
    padding: 0.75rem;
    border-radius: 0.75rem;
  }
  :global(.servone-bug-callout) {
    width: min(16rem, calc(100vw - 6rem));
  }
  :global(.servone-bug-title) {
    margin-bottom: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 600;
  }
  :global(.servone-bug-note) {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.4;
  }
  :global(.servone-bug-field) {
    box-sizing: border-box;
    display: block;
    width: 100%;
    min-height: 6rem;
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--input);
    border-radius: 6px;
    background: var(--card);
    color: var(--foreground);
    font: inherit;
    font-size: 0.8125rem;
    line-height: 1.4;
    resize: vertical;
    outline: none;
    transition: border-color 120ms ease-out, box-shadow 120ms ease-out;
  }
  :global(.servone-bug-field:focus-visible) {
    border-color: var(--ring);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 25%, transparent);
  }
  :global(.servone-bug-shots) {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  :global(.servone-bug-shot) {
    position: relative;
    width: 3.5rem;
    height: 3.5rem;
  }
  :global(.servone-bug-shot img) {
    width: 100%;
    height: 100%;
    border: 1px solid var(--border);
    border-radius: 6px;
    object-fit: cover;
  }
  :global(.servone-bug-shot-remove) {
    position: absolute;
    top: -0.375rem;
    right: -0.375rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.125rem;
    height: 1.125rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--card);
    color: var(--muted-foreground);
    cursor: pointer;
  }
  :global(.servone-bug-shot-remove:hover) {
    color: var(--foreground);
  }
  :global(.servone-bug-shot-remove:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }
  :global(.servone-bug-error) {
    margin: 0.5rem 0 0;
    color: var(--destructive);
    font-size: 0.75rem;
    line-height: 1.35;
  }
  :global(.servone-bug-footer) {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.625rem;
  }
  :global(.servone-bug-hint) {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }
  :global(.servone-bug-action) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 1.875rem;
    padding: 0 0.75rem;
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: 0.8125rem;
    cursor: pointer;
    transition: background-color 120ms ease-out, color 120ms ease-out, transform 80ms ease-out;
  }
  :global(.servone-bug-action:active:not(:disabled)) {
    transform: translateY(1px);
  }
  :global(.servone-bug-action:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }
  :global(.servone-bug-action.primary) {
    background: var(--primary);
    color: var(--primary-foreground);
  }
  :global(.servone-bug-action.primary:hover:not(:disabled)) {
    background: color-mix(in oklch, var(--primary) 88%, white);
  }
  :global(.servone-bug-action.primary:disabled) {
    background: var(--muted);
    color: var(--muted-foreground);
    cursor: default;
  }
  :global(.servone-bug-action.quiet) {
    background: transparent;
    color: var(--muted-foreground);
  }
  :global(.servone-bug-action.quiet:hover) {
    background: var(--accent);
    color: var(--foreground);
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.servone-bug-trigger),
    :global(.servone-bug-action) {
      transition: none;
    }
  }
</style>
