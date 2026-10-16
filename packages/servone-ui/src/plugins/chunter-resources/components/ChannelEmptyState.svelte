<script lang="ts">
  import type { Doc, Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import { Button } from '../../../lib/components/ui/button'
  import { emptyCopy } from '../../../onboarding/empty-copy'
  import chunter from '../plugin'

  export let objectId: Ref<Doc>

  let messageCount: number | undefined
  const messageQuery = createQuery()
  $: messageQuery.query(chunter.class.ChatMessage, { attachedTo: objectId }, (found) => {
    messageCount = found.total
  }, { limit: 1, total: true })

  function focusInput (): void {
    document.querySelector<HTMLElement>('.popupPanel-body__main [contenteditable="true"]')?.focus()
  }
</script>

{#if messageCount === 0}
  <div class="channel-empty-state pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 pb-28 text-center">
    <p class="m-0 max-w-xs text-sm text-foreground"><Label label={emptyCopy.chat} /></p>
    <div class="pointer-events-auto">
      <Button size="sm" onclick={focusInput}><Label label={emptyCopy.chatAction} /></Button>
    </div>
  </div>
{/if}

<style>
  :global(.popupPanel-body__main:has(.channel-empty-state)) {
    position: relative;
  }
  :global(.popupPanel-body__main:has(.channel-empty-state) div:has(> .an-element__label.header)) {
    display: none;
  }
</style>
