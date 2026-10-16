<script lang="ts">
  import type { ChatMessage } from '@hcengineering/chunter'
  import { translate } from '@hcengineering/platform'
  import textEditor from '@hcengineering/text-editor'
  import { Label, themeStore, tooltip } from '@hcengineering/ui'
  import { Hash, Lock, MessageCircle, User } from '@lucide/svelte'
  import { createEventDispatcher, onMount } from 'svelte'

  import { menuItemClass, menuScrollClass, triggerButtonClass } from '../../../lib/menu-classes'
  import { forwardMessage } from './send'
  import { forwardStrings } from './strings'
  import { loadTargets, matchesTarget, targetKey, type ForwardTarget } from './targets'

  export let message: ChatMessage

  const dispatch = createEventDispatcher()

  let targets: ForwardTarget[] = []
  let query = ''
  let note = ''
  let selected: ForwardTarget | undefined
  let isSending = false
  let searchPlaceholder = ''
  let notePlaceholder = ''
  let searchInput: HTMLInputElement

  $: void translate(forwardStrings.Search, {}, $themeStore.language).then((t) => (searchPlaceholder = t))
  $: void translate(forwardStrings.Note, {}, $themeStore.language).then((t) => (notePlaceholder = t))
  $: shown = targets.filter((target) => matchesTarget(target, query))

  onMount(() => {
    searchInput.focus()
    void loadTargets().then((found) => (targets = found))
  })

  function isBlocked (target: ForwardTarget): boolean {
    return target.kind === 'channel' && !target.canPost
  }

  async function send (): Promise<void> {
    if (selected === undefined || isSending) return
    isSending = true
    try {
      await forwardMessage(message, selected, note)
      dispatch('close')
    } finally {
      isSending = false
    }
  }
</script>

<form
  class="flex w-[28rem] max-w-[90vw] flex-col gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg"
  on:submit|preventDefault={send}
>
  <h2 class="text-base font-semibold"><Label label={forwardStrings.ForwardMessage} /></h2>
  <input
    bind:this={searchInput}
    bind:value={query}
    type="search"
    placeholder={searchPlaceholder}
    class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
  />
  <div class="{menuScrollClass} -mx-1 flex flex-col" role="listbox">
    {#each shown as target (targetKey(target))}
      {@const isDisabled = isBlocked(target)}
      <!-- A disabled button gets no pointer events, so the tooltip sits on a wrapper. -->
      <div use:tooltip={isDisabled ? { label: forwardStrings.OnlyOwnersPost } : undefined}>
        <button
          type="button"
          role="option"
          aria-selected={selected !== undefined && targetKey(selected) === targetKey(target)}
          disabled={isDisabled}
          class="{menuItemClass} aria-selected:bg-accent aria-selected:text-accent-foreground"
          on:click={() => (selected = target)}
        >
          <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {#if target.kind === 'channel'}
              {#if target.channel.private}<Lock size={14} />{:else}<Hash size={14} />{/if}
            {:else if target.kind === 'direct'}
              <MessageCircle size={14} />
            {:else}
              <User size={14} />
            {/if}
          </span>
          <span class="flex-1 truncate">{target.label}</span>
        </button>
      </div>
    {/each}
  </div>
  <textarea
    bind:value={note}
    rows="2"
    placeholder={notePlaceholder}
    class="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
  ></textarea>
  <div class="flex justify-end">
    <button
      type="submit"
      disabled={selected === undefined || isSending}
      class={triggerButtonClass('primary', selected === undefined || isSending, false)}
    >
      <Label label={textEditor.string.Send} />
    </button>
  </div>
</form>
