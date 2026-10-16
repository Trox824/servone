<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import type { Room } from '@hcengineering/love'
  import { Check, Link } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import { copyGuestLink } from '../guest'
  import { textOf, type Lang } from '../strings'

  export let room: Ref<Room>
  export let meetingEnd: number
  export let lang: Lang

  const COPIED_NOTE_MS = 2000

  $: t = textOf(lang)
  let isCopied = false
  let hasFailed = false

  function copy (): void {
    hasFailed = false
    void copyGuestLink(room, meetingEnd).then(
      () => {
        isCopied = true
        setTimeout(() => { isCopied = false }, COPIED_NOTE_MS)
      },
      (err: Error) => {
        hasFailed = true
        throw err
      }
    )
  }
</script>

<span class="inline-grid justify-items-start gap-1">
  <Button variant="outline" size="sm" onclick={copy}>
    {#if isCopied}<Check />{:else}<Link />{/if}<span aria-live="polite">{isCopied ? t('GuestLinkCopied') : t('CopyGuestLink')}</span>
  </Button>
  {#if hasFailed}<span class="text-xs text-destructive" role="alert">{t('GuestLinkFailed')}</span>{/if}
</span>
