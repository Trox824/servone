<script lang="ts">
  import attachment, { type Attachment } from '@hcengineering/attachment'
  import type { Ref } from '@hcengineering/core'
  import { deleteFile, getClient, getFileUrl, MessageBox, uploadFile } from '@hcengineering/presentation'
  import { deviceOptionsStore as deviceInfo, showPopup } from '@hcengineering/ui'
  import { EmptyMarkup, htmlToMarkup, isEmptyMarkup, jsonToHTML, markupToJSON, type Markup } from '@hcengineering/text'
  import { StyledTextBox } from '@hcengineering/text-editor-resources'
  import {
    ATTACHMENT_LIMIT_BYTES,
    cardBase,
    findPreset,
    MAIL_MESSAGE_CLASS,
    MAIL_THREAD_CLASS,
    subjectKey,
    type MailAccountCard,
    type MailMessageCard,
    type MailThreadCard
  } from '@servone/mail'
  import { onDestroy, onMount, tick } from 'svelte'
  import { fetchBodyNow, MailApiError, saveDraftToProvider } from '../api'
  import { seedFor, type ComposeMode } from '../lib/compose'
  import { DraftSaver } from '../lib/draft-saver'
  import {
    canSendDraft,
    discardNeedsConfirm,
    discardStep,
    draftBodySource,
    draftCardFields,
    draftChanges,
    totalAttachmentBytes,
    type DraftBodyLoad,
    type DraftFields
  } from '../lib/drafts'
  import { mailErrorKey } from '../lib/errors'
  import { queueSend } from '../lib/send'
  import { str, text } from '../plugin'
  import { Button } from '../../lib/components/ui/button'
  import { Input } from '../../lib/components/ui/input'
  import RecipientInput from './RecipientInput.svelte'

  export let mode: ComposeMode
  export let parent: MailMessageCard | undefined
  export let thread: Ref<MailThreadCard> | undefined
  export let draft: MailMessageCard | undefined
  export let docked: boolean
  export let account: MailAccountCard
  export let lang: string = 'en'
  export let onClose: (() => void) | undefined = undefined
  export let onDraftCreated: ((draft: Ref<MailMessageCard>) => void) | undefined = undefined
  export let onReopen: (draft: MailMessageCard, mode: ComposeMode) => void

  const CURSOR_STORAGE_PREFIX = 'servone-mail-cursor:'
  const BASE64_RAW_RATIO = 3 / 4

  let to: string[] = []
  let cc: string[] = []
  let bcc: string[] = []
  let showCcBcc = false
  let subject = ''
  let bodyMarkup: Markup = EmptyMarkup
  let inReplyTo = ''
  let references: string[] = []

  let draftCard: MailMessageCard | undefined = draft
  let draftCreation: Promise<MailMessageCard> | undefined
  let savedHtml: string | undefined
  let bodyLoad: DraftBodyLoad = draft === undefined ? 'ready' : 'loading'
  let attachments: Array<{ _id: Ref<Attachment>, name: string, size: number }> = []
  let attachmentError: string | undefined
  let sendErrorText: string | undefined
  let isSending = false
  let draftSavedNote = ''
  let saveNotSavedError: string | undefined
  let fileInput: HTMLInputElement | undefined
  let bodyContainerEl: HTMLElement | undefined

  function bodyHtml (): string {
    return jsonToHTML(markupToJSON(bodyMarkup))
  }

  function currentFields (): DraftFields {
    return { to, cc, bcc, subject, html: bodyHtml(), inReplyTo, references }
  }

  const saver = new DraftSaver(
    save,
    (run, ms) => window.setTimeout(run, ms),
    (handle) => { window.clearTimeout(handle) },
    () => { saveNotSavedError = text('DraftNotSaved') }
  )

  function touch (): void {
    saveNotSavedError = undefined
    saver.touch()
  }

  async function findDraft (id: Ref<MailMessageCard>): Promise<MailMessageCard> {
    const found = await getClient().findOne(MAIL_MESSAGE_CLASS, { _id: id })
    if (found === undefined) throw new Error(`composer: draft card ${id} not found`)
    return found
  }

  async function ensureDraft (): Promise<MailMessageCard> {
    if (draftCard !== undefined) return draftCard
    draftCreation ??= createDraft().finally(() => { draftCreation = undefined })
    return await draftCreation
  }

  async function createDraft (): Promise<MailMessageCard> {
    const client = getClient()
    let threadRef = thread
    if (threadRef === undefined) {
      threadRef = await client.createDoc(MAIL_THREAD_CLASS, account.space, Object.assign(cardBase(subject), {
        mailAccount: account._id,
        mailSubjectKey: subjectKey(subject),
        mailParticipants: [],
        mailLastMessageAt: Date.now(),
        mailSnippet: '',
        mailFolders: [],
        mailHasUnread: false,
        mailIsStarred: false,
        mailHasAttachments: false,
        mailMessageCount: 0,
        mailProviderThreadId: ''
      }))
    }
    const fields = draftCardFields(account, threadRef, currentFields(), '')
    const id = await client.createDoc(MAIL_MESSAGE_CLASS, account.space, Object.assign(cardBase(subject), fields))
    const created = await findDraft(id)
    draftCard = created
    onDraftCreated?.(created._id)
    return created
  }

  async function save (): Promise<void> {
    if (bodyLoad !== 'ready') throw new Error(`composer: draft body is ${bodyLoad}`)
    const client = getClient()
    const current = await ensureDraft()
    const fields = currentFields()
    let bodyBlob = current.mailBodyBlob
    if (fields.html !== savedHtml || bodyBlob === '') {
      bodyBlob = (await uploadFile(new File([fields.html], 'body.html', { type: 'text/html' }))).uuid
    }
    await client.update(current, draftChanges(current, fields, bodyBlob))
    savedHtml = fields.html
    if (bodyBlob !== current.mailBodyBlob && current.mailBodyBlob !== '') deleteFile(current.mailBodyBlob).catch(reportUnexpected)
    await saveDraftToProvider(current._id)
    draftCard = await findDraft(current._id)
    draftSavedNote = text('DraftSaved')
  }

  function characterOffsetIn (root: HTMLElement): number | undefined {
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0) return undefined
    const range = selection.getRangeAt(0)
    if (!root.contains(range.startContainer)) return undefined
    const preRange = range.cloneRange()
    preRange.selectNodeContents(root)
    preRange.setEnd(range.startContainer, range.startOffset)
    return preRange.toString().length
  }

  function setCaretAt (root: HTMLElement, offset: number): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let remaining = offset
    let node = walker.nextNode()
    while (node !== null) {
      const length = node.textContent?.length ?? 0
      if (remaining <= length) {
        const range = document.createRange()
        range.setStart(node, remaining)
        range.collapse(true)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        return
      }
      remaining -= length
      node = walker.nextNode()
    }
  }

  function saveCursor (): void {
    if (draftCard === undefined || bodyContainerEl === undefined) return
    const editableRoot = bodyContainerEl.querySelector<HTMLElement>('.ProseMirror')
    if (editableRoot === null) return
    const offset = characterOffsetIn(editableRoot)
    if (offset === undefined) return
    try {
      sessionStorage.setItem(`${CURSOR_STORAGE_PREFIX}${draftCard._id}`, String(offset))
    } catch {
    }
  }

  async function restoreCursor (draftId: string): Promise<void> {
    let stored: string | null = null
    try {
      stored = sessionStorage.getItem(`${CURSOR_STORAGE_PREFIX}${draftId}`)
    } catch {
      return
    }
    if (stored === null) return
    const offset = Number(stored)
    if (Number.isNaN(offset)) return
    await tick()
    const editableRoot = bodyContainerEl?.querySelector<HTMLElement>('.ProseMirror')
    if (editableRoot !== null && editableRoot !== undefined) setCaretAt(editableRoot, offset)
  }

  async function fetchBlobText (blobId: string): Promise<string | undefined> {
    const response = await fetch(getFileUrl(blobId))
    if (!response.ok) return undefined
    return await response.text()
  }

  async function loadDraftBody (initial: MailMessageCard): Promise<{ card: MailMessageCard, html: string } | undefined> {
    let card = initial
    let source = draftBodySource(card)
    if (source === 'provider') {
      try {
        await fetchBodyNow(card._id)
      } catch (error) {
        if (error instanceof MailApiError) return undefined
        throw error
      }
      card = await findDraft(card._id)
      source = draftBodySource(card)
    }
    if (source === 'none') return { card, html: '' }
    if (source !== 'blob') return undefined
    const html = await fetchBlobText(card.mailBodyBlob)
    return html === undefined ? undefined : { card, html }
  }

  async function loadAttachments (message: MailMessageCard): Promise<void> {
    const client = getClient()
    const found = await client.findAll(attachment.class.Attachment, { attachedTo: message._id, space: message.space })
    attachments = found.map((doc) => ({ _id: doc._id, name: doc.name, size: doc.size }))
  }

  function attachedSizes (): number[] {
    return attachments.map((entry) => entry.size)
  }

  async function attachFiles (files: FileList): Promise<void> {
    attachmentError = undefined
    const incomingSizes = Array.from(files).map((file) => file.size)
    const projectedTotal = totalAttachmentBytes([...attachedSizes(), ...incomingSizes])
    const cap = ATTACHMENT_LIMIT_BYTES[account.mailProvider] * BASE64_RAW_RATIO
    if (projectedTotal > cap) {
      const limitMb = Math.floor(ATTACHMENT_LIMIT_BYTES[account.mailProvider] / (1024 * 1024))
      attachmentError = text('AttachmentTooLarge', { limit: limitMb, provider: findPreset(account.mailProvider)?.label ?? account.mailProvider })
      return
    }
    const client = getClient()
    const current = await ensureDraft()
    for (const file of Array.from(files)) {
      const uploaded = await uploadFile(file)
      const id = await client.addCollection(attachment.class.Attachment, current.space, current._id, MAIL_MESSAGE_CLASS, 'attachments', {
        name: file.name,
        file: uploaded.uuid,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified
      })
      attachments = [...attachments, { _id: id, name: file.name, size: file.size }]
    }
    touch()
  }

  function openFilePicker (): void {
    fileInput?.click()
  }

  function handleFileChange (event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    if (input.files !== null && input.files.length > 0) {
      attachFiles(input.files).catch((error: Error) => { attachmentError = text(mailErrorKey(error)) })
    }
    input.value = ''
  }

  async function send (): Promise<void> {
    if (!canSendDraft(bodyLoad, isSending)) return
    isSending = true
    sendErrorText = undefined
    try {
      if (draftCard === undefined) await saver.saveNow()
      else await saver.flush()
    } catch (error) {
      if (!(error instanceof Error)) throw error
      sendErrorText = `${text('SendFailed')} ${text(mailErrorKey(error))}`
      return
    } finally {
      isSending = false
    }
    const saved = draftCard
    if (saved === undefined) return
    const sentMode = mode
    queueSend(saved, () => { onReopen(saved, sentMode) })
    onClose?.()
  }

  function confirmDiscard (): Promise<boolean> {
    return new Promise((resolve) => {
      showPopup(
        MessageBox,
        { label: str.DiscardConfirmTitle, message: str.DiscardConfirmBody, okLabel: str.DiscardConfirmConfirm, dangerous: true },
        'top',
        (result) => { resolve(result === true) }
      )
    })
  }

  async function discard (): Promise<void> {
    if (discardNeedsConfirm(isEmptyMarkup(bodyMarkup), bodyLoad)) {
      const confirmed = await confirmDiscard()
      if (!confirmed) return
    }
    await saver.stop()
    if (draftCreation !== undefined) await draftCreation
    const known = draftCard
    draftCard = undefined
    savedHtml = undefined
    if (known === undefined) {
      onClose?.()
      return
    }
    const client = getClient()
    const current = await client.findOne(MAIL_MESSAGE_CLASS, { _id: known._id })
    if (current === undefined) {
      onClose?.()
      return
    }
    const siblings = await client.findAll(MAIL_MESSAGE_CLASS, { mailThread: current.mailThread })
    const step = discardStep(current, siblings.filter((message) => message._id !== current._id).length)
    if (step === 'markDeleted') {
      await client.update(current, { mailIsDeleted: true })
    } else {
      await client.removeDoc(MAIL_MESSAGE_CLASS, current.space, current._id)
      if (current.mailBodyBlob !== '') await deleteFile(current.mailBodyBlob)
      if (step === 'removeCardAndThread') await client.removeDoc(MAIL_THREAD_CLASS, current.space, current.mailThread)
    }
    onClose?.()
  }

  function reportUnexpected (error: Error): void {
    throw error
  }

  function closeWithFlush (): void {
    saver.flush().finally(() => { onClose?.() }).catch(reportUnexpected)
  }

  function handleKeydown (event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      send().catch(reportUnexpected)
      return
    }
    if (event.key === 'Escape' && !docked) {
      event.preventDefault()
      closeWithFlush()
    }
  }

  function handleBeforeUnload (): void {
    saveCursor()
    saver.flush().catch(() => {})
  }

  onMount(() => {
    void (async () => {
      if (draft !== undefined) {
        onDraftCreated?.(draft._id)
        to = draft.mailTo
        cc = draft.mailCc
        bcc = draft.mailBcc
        showCcBcc = cc.length > 0 || bcc.length > 0
        subject = draft.title
        inReplyTo = draft.mailInReplyTo
        references = draft.mailReferences
        const loaded = await loadDraftBody(draft)
        if (loaded === undefined) {
          bodyLoad = 'failed'
          return
        }
        draftCard = loaded.card
        if (loaded.html !== '') {
          bodyMarkup = htmlToMarkup(loaded.html)
          savedHtml = bodyHtml()
        }
        await loadAttachments(loaded.card)
        bodyLoad = 'ready'
        await restoreCursor(draft._id)
      } else if (parent !== undefined) {
        const parentHtml = parent.mailBodyBlob === '' ? '' : (await fetchBlobText(parent.mailBodyBlob)) ?? ''
        const seed = seedFor(mode, parent, parentHtml, `${account.mailDisplayName} <${account.mailEmail}>`, lang)
        to = seed.to
        cc = seed.cc
        subject = seed.subject
        inReplyTo = seed.inReplyTo
        references = seed.references
        bodyMarkup = seed.quoteHtml !== '' ? htmlToMarkup(seed.quoteHtml) : EmptyMarkup
      }
    })().catch((error: Error) => {
      if (bodyLoad === 'loading') bodyLoad = 'failed'
      reportUnexpected(error)
    })
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onDestroy(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    saveCursor()
    saver.flush().catch(() => {})
  })

  $: showSubject = mode === 'new' || mode === 'forward'
  $: liveStatus = isSending ? text('Sending') : bodyLoad === 'loading' ? text('LoadingBody') : draftSavedNote
</script>

<div class="composer" class:composer--modal={!docked} on:keydown={handleKeydown} role="group" aria-label={text('Compose')}>
  {#if !docked || $deviceInfo.isMobile}
    <div class="composer__header">
      <span class="composer__title">{subject !== '' ? subject : text('NoSubject')}</span>
      <button type="button" class="composer__close" aria-label={text('CloseCompose')} on:click={closeWithFlush}>×</button>
    </div>
  {/if}
  <div class="composer__recipients">
    <RecipientInput label={text('To')} inputId="composer-to" bind:addresses={to} on:change={touch} />
    {#if !showCcBcc}
      <button type="button" class="composer__cc-toggle" on:click={() => { showCcBcc = true }}>{text('Cc')} {text('Bcc')}</button>
    {:else}
      <RecipientInput label={text('Cc')} inputId="composer-cc" bind:addresses={cc} on:change={touch} />
      <RecipientInput label={text('Bcc')} inputId="composer-bcc" bind:addresses={bcc} on:change={touch} />
    {/if}
  </div>

  {#if showSubject}
    <Input
      class="composer__subject"
      placeholder={text('Subject')}
      bind:value={subject}
      oninput={touch}
      aria-label={text('Subject')}
    />
  {/if}

  <div class="composer__body" bind:this={bodyContainerEl}>
    <StyledTextBox
      bind:content={bodyMarkup}
      alwaysEdit
      editorAttributes={{ 'aria-label': text('MessageBody') }}
      autofocus={docked && draft === undefined}
      showButtons={false}
      kind="normal"
      maxHeight="card"
      readonly={bodyLoad !== 'ready'}
      on:changeContent={touch}
    />
  </div>

  {#if attachments.length > 0}
    <ul class="composer__attachments">
      {#each attachments as entry (entry._id)}
        <li>{entry.name}</li>
      {/each}
    </ul>
  {/if}
  {#if attachmentError !== undefined}
    <p class="composer__error" role="alert">{attachmentError}</p>
  {/if}

  <div class="composer__footer">
    <Button data-track="mail.compose.attach" variant="ghost" size="sm" onclick={openFilePicker}>{text('Attach')}</Button>
    <input bind:this={fileInput} type="file" multiple class="composer__file-input" on:change={handleFileChange} />
    <Button data-track="mail.compose.discard" variant="ghost" size="sm" onclick={() => { discard().catch(reportUnexpected) }}>{text('Discard')}</Button>
    <div class="composer__footer-spacer" />
    <span class="sr-only" aria-live="polite">{liveStatus}</span>
    {#if bodyLoad === 'loading'}
      <span class="composer__saved-note">{text('LoadingBody')}</span>
    {:else if bodyLoad === 'failed'}
      <span class="composer__error" role="alert">{text('DraftLoadFailed')}</span>
    {:else if sendErrorText !== undefined}
      <span class="composer__error" role="alert">{sendErrorText}</span>
    {:else if saveNotSavedError !== undefined}
      <span class="composer__error" role="alert">{saveNotSavedError}</span>
    {:else if draftSavedNote !== ''}
      <span class="composer__saved-note">{draftSavedNote}</span>
    {/if}
    <Button data-track="mail.compose.send" size="sm" disabled={!canSendDraft(bodyLoad, isSending)} onclick={() => { send().catch(reportUnexpected) }}>
      {isSending ? text('Sending') : text('Send')}
    </Button>
  </div>
</div>

<style>
  .composer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: var(--theme-bg-color);
    border-top: 1px solid var(--theme-divider-color);
  }
  .composer--modal {
    width: 720px;
    max-width: calc(100vw - 32px);
    border-top: none;
    border-radius: 12px;
    box-shadow: var(--theme-popup-shadow);
  }
  .composer__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .composer__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .composer__close {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: none;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    color: var(--theme-halfcontent-color);
  }
  .composer__recipients {
    display: flex;
    flex-direction: column;
  }
  .composer__cc-toggle {
    align-self: flex-start;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--theme-halfcontent-color);
    font-size: 13px;
    padding: 4px 0;
  }
  /* The modal renders outside .mail-app, and the global button reset removes the outline. */
  .composer__close:focus-visible,
  .composer__cc-toggle:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .composer__body {
    flex: 1;
    min-height: 160px;
  }
  /* StyledTextBox reserves a 40px gutter for its block-insert menu (tables, diagrams), which has no place in an email body. */
  .composer__body :global(.tiptap-left-menu) {
    display: none;
  }
  .composer .composer__body :global(.select-text) {
    padding-left: 0;
  }
  .composer__attachments {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 13px;
    color: var(--theme-halfcontent-color);
  }
  .composer__error {
    color: var(--theme-error-color, #c0342c);
    font-size: 13px;
  }
  .composer__saved-note {
    color: var(--theme-halfcontent-color);
    font-size: 13px;
  }
  .composer__footer {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .composer__footer-spacer {
    flex: 1;
  }
  .composer__file-input {
    display: none;
  }
</style>
