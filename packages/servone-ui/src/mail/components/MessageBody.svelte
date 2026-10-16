<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import { getFileUrl } from '@hcengineering/presentation'
  import { FileWarning } from '@lucide/svelte'
  import { onDestroy } from 'svelte'
  import type { MailMessageCard } from '@servone/mail'
  import { Skeleton } from '../../lib/components/ui/skeleton'
  import { Button } from '../../lib/components/ui/button'
  import { MailApiError } from '../api'
  import { bodyCache, cacheBody, loadBody, type BodyState } from '../lib/body'
  import { prepareMailHtml } from '../lib/html'
  import { text } from '../plugin'
  import EmptyPane from './EmptyPane.svelte'

  export let message: Pick<MailMessageCard, '_id' | 'mailBodyBlob' | 'mailRawBlob' | 'title'>
  export let fetchText: (blob: string) => Promise<string>
  export let fetchNow: (id: Ref<MailMessageCard>) => Promise<void>

  const MAX_BODY_HEIGHT_PX = 4000 // one screen-long newsletter; beyond it the frame scrolls
  const SKELETON_LINES = [0, 1, 2, 3]
  const PLACEHOLDER_HEIGHT_PX = 120 // about a short reply, so the frame settles with a small shift instead of growing from 0

  let bodyState: BodyState | undefined
  let shouldShowImages = false
  let iframe: HTMLIFrameElement | undefined
  let resizeObserver: ResizeObserver | undefined
  let frameHeight = PLACEHOLDER_HEIGHT_PX

  let shownForId: Ref<MailMessageCard> | undefined
  let refreshSeq = 0
  $: void refreshBody(message._id, message.mailBodyBlob, message.mailRawBlob)

  async function refreshBody (id: Ref<MailMessageCard>, mailBodyBlob: string, mailRawBlob: string): Promise<void> {
    if (id !== shownForId) {
      shouldShowImages = false
      shownForId = id
    }
    const seq = ++refreshSeq
    const cached = bodyCache.get(id)
    if (cached !== undefined) {
      bodyState = { kind: 'html', html: cached }
      return
    }
    let state: BodyState
    try {
      state = await loadBody({ _id: id, mailBodyBlob, mailRawBlob }, fetchText, fetchNow)
    } catch (error) {
      if (!(error instanceof MailApiError)) throw error
      state = { kind: 'unavailable' }
    }
    if (seq !== refreshSeq) return
    if (state.kind === 'html') cacheBody(id, state.html)
    bodyState = state
  }

  $: prepared = bodyState?.kind === 'html' ? prepareMailHtml(bodyState.html, shouldShowImages) : undefined

  function attachResizeObserver (): void {
    resizeObserver?.disconnect()
    const body = iframe?.contentDocument?.body
    if (body == null) return
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(body)
  }

  function measure (): void {
    const root = iframe?.contentDocument?.documentElement
    if (root == null) return
    frameHeight = Math.min(root.scrollHeight, MAX_BODY_HEIGHT_PX)
  }

  function handleLoad (): void {
    attachResizeObserver()
    measure()
  }

  onDestroy(() => {
    resizeObserver?.disconnect()
  })
</script>

<div class="message-body">
  {#if bodyState?.kind === 'pending' || bodyState === undefined}
    <div class="message-body__skeleton" aria-live="polite" aria-busy="true">
      <span class="sr-only">{text('LoadingBody')}</span>
      {#each SKELETON_LINES as line (line)}
        <Skeleton class="h-4 w-full" />
      {/each}
    </div>
  {:else if bodyState.kind === 'raw'}
    <div class="message-body__raw">
      <EmptyPane icon={FileWarning} title={text('CannotDisplay')} lines={[]} />
      <a class="message-body__download" href={getFileUrl(bodyState.rawBlob, 'message.eml')} download>{text('DownloadOriginal')}</a>
    </div>
  {:else if bodyState.kind === 'failed'}
    <EmptyPane icon={FileWarning} title={text('CannotDisplay')} lines={[]} />
  {:else if bodyState.kind === 'unavailable'}
    <p class="message-body__unavailable">{text('BodyUnavailable')}</p>
  {:else if bodyState.kind === 'empty'}
    <div class="message-body__empty" />
  {:else if prepared !== undefined}
    {#if prepared.hasRemoteImages && !shouldShowImages}
      <div class="message-body__images-blocked">
        <span>{text('ImagesBlocked')}</span>
        <Button size="sm" variant="outline" onclick={() => { shouldShowImages = true }}>{text('ShowImages')}</Button>
      </div>
    {/if}
    <iframe
      bind:this={iframe}
      class="message-body__frame"
      title={message.title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcdoc={prepared.srcdoc}
      style="height: {frameHeight}px"
      onload={handleLoad}
    ></iframe>
  {/if}
</div>

<style>
  .message-body__unavailable {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 13px;
  }
  .message-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .message-body__skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0;
  }
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
  .message-body__raw {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .message-body__download {
    color: var(--theme-link-color);
    font-size: 13px;
  }
  .message-body__images-blocked {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    align-self: flex-start;
    max-width: 100%;
    padding: 6px 6px 6px 12px;
    border-radius: 8px;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 13px;
  }
  /* Matches the white page in BASE_STYLE (lib/html.ts) so the email reads as paper on the dark theme. */
  .message-body__frame {
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: #fff;
  }
</style>
