<script lang="ts">
  import { translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { Label, themeStore } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { getObjectLinkId } from '@hcengineering/view-resources'
  import { Hash, Lock, MessageCircle, Search, User } from '@lucide/svelte'
  import { createEventDispatcher, onMount } from 'svelte'

  import { menuItemClass, menuScrollClass } from '../../../lib/menu-classes'
  import { loadTargets, matchesTarget, resolveDestination, targetKey, type ForwardTarget } from '../forward/targets'
  import { userSearch } from '../index'
  import { navigateToSpecial, openChannel } from '../navigation'
  import { shortcutStrings } from './strings'

  export let isPeopleOnly = false

  const dispatch = createEventDispatcher()
  const linkProviders = getClient().getModel().findAllSync(view.mixin.LinkIdProvider, {})

  let targets: ForwardTarget[] = []
  let query = ''
  let activeIndex = 0
  let placeholder = ''
  let searchInput: HTMLInputElement
  let list: HTMLElement

  $: void translate(
    isPeopleOnly ? shortcutStrings.JumpToPerson : shortcutStrings.JumpTo,
    {},
    $themeStore.language
  ).then((t) => (placeholder = t))
  $: shown = targets.filter((target) => matchesTarget(target, query))
  $: hasMessageSearch = !isPeopleOnly && query.trim() !== ''
  $: rowCount = shown.length + (hasMessageSearch ? 1 : 0)

  onMount(() => {
    searchInput.focus()
    void loadTargets().then((found) => {
      targets = isPeopleOnly ? found.filter((target) => target.kind !== 'channel') : found
    })
  })

  async function open (target: ForwardTarget): Promise<void> {
    dispatch('close')
    const destination = await resolveDestination(target)
    const id = await getObjectLinkId(linkProviders, destination._id, destination._class)
    openChannel(id, destination._class, undefined, true)
  }

  function searchMessages (): void {
    dispatch('close')
    userSearch.set(query.trim())
    navigateToSpecial('chunterBrowser')
  }

  function moveActive (step: 1 | -1): void {
    if (rowCount === 0) return
    activeIndex = (activeIndex + step + rowCount) % rowCount
    list.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (shown[activeIndex] !== undefined) void open(shown[activeIndex])
      else if (hasMessageSearch) searchMessages()
    }
  }
</script>

<div
  class="flex w-[32rem] max-w-[90vw] flex-col gap-2 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg"
>
  <input
    bind:this={searchInput}
    bind:value={query}
    type="search"
    {placeholder}
    class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
    on:input={() => (activeIndex = 0)}
    on:keydown={handleKeydown}
  />
  <div bind:this={list} class="{menuScrollClass} flex flex-col" role="listbox">
    {#each shown as target, index (targetKey(target))}
      <button
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        class="{menuItemClass} aria-selected:bg-accent aria-selected:text-accent-foreground"
        on:mousemove={() => (activeIndex = index)}
        on:click={() => open(target)}
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
    {/each}
    {#if hasMessageSearch}
      <button
        type="button"
        role="option"
        aria-selected={activeIndex === shown.length}
        class="{menuItemClass} aria-selected:bg-accent aria-selected:text-accent-foreground"
        on:mousemove={() => (activeIndex = shown.length)}
        on:click={searchMessages}
      >
        <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground"><Search size={14} /></span>
        <span class="flex-1 truncate"><Label label={shortcutStrings.SearchMessages} params={{ query: query.trim() }} /></span>
      </button>
    {/if}
  </div>
</div>
