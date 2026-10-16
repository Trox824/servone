<script lang="ts">
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { MessageBox } from '@hcengineering/presentation'
  import { showPopup, tooltip } from '@hcengineering/ui'
  import { languageStore } from '@hcengineering/theme'
  import type { Room } from '@hcengineering/love'
  import { PhoneOff } from '@lucide/svelte'
  import { createEventDispatcher } from 'svelte'
  import { leaveMeeting } from '../../../meetings'
  import { textOf } from '../../../calls/strings'

  export let room: Room
  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'
  export let noLabel: boolean = false

  const dispatch = createEventDispatcher()

  $: translate = textOf($languageStore === 'vi' ? 'vi' : 'en')
  $: leaveText = translate('LeaveCall')

  async function leaveAfterConfirm (): Promise<void> {
    await leaveMeeting()
    dispatch('leave')
  }

  function askToLeave (): void {
    showPopup(MessageBox, {
      label: getEmbeddedLabel(leaveText),
      okLabel: getEmbeddedLabel(leaveText),
      message: getEmbeddedLabel(translate('LeaveCallConfirm')),
      dangerous: true,
      action: leaveAfterConfirm
    })
  }
</script>

<button
  type="button"
  class="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-destructive font-medium text-white outline-none transition-colors hover:bg-destructive/85 focus-visible:ring-3 focus-visible:ring-destructive/40 [&_svg]:size-5 {noLabel
    ? 'w-14'
    : 'px-5'}"
  aria-label={leaveText}
  use:tooltip={noLabel ? { label: getEmbeddedLabel(leaveText), direction: 'top' } : undefined}
  on:click={askToLeave}
>
  <PhoneOff aria-hidden="true" />
  {#if !noLabel}
    {leaveText}
  {/if}
</button>
