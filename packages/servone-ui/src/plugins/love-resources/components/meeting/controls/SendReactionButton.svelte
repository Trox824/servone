<script lang="ts">
  import emojiPlugin from '@hcengineering/emoji'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import { showPopup, tooltip } from '@hcengineering/ui'
  import { SmilePlus } from '@lucide/svelte'
  import { textOf } from '../../../calls/strings'
  import { lk } from '../../../utils'

  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'

  $: reactionLabel = textOf($languageStore === 'vi' ? 'vi' : 'en')('SendReaction')

  function openEmojiPicker (event: MouseEvent): void {
    const anchorElement = event.currentTarget as HTMLElement
    showPopup(emojiPlugin.component.EmojiPopup, {}, anchorElement, (picked) => {
      if (picked?.text == null) return
      void lk.localParticipant.sendChatMessage(picked.text, { topic: 'reaction' })
    })
  }
</script>

<button
  type="button"
  class="reaction-trigger grid size-11 place-items-center rounded-full bg-secondary text-secondary-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
  aria-label={reactionLabel}
  aria-haspopup="dialog"
  use:tooltip={{ label: getEmbeddedLabel(reactionLabel), direction: 'top' }}
  data-size={size}
  on:click={openEmojiPicker}
>
  <SmilePlus size={20} aria-hidden="true" />
</button>
