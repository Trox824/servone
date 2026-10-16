<script lang="ts">
  import chunter, { type ChatMessage } from '@hcengineering/chunter'
  import { getName } from '@hcengineering/contact'
  import { Avatar, getPersonByPersonIdStore } from '@hcengineering/contact-resources'
  import { SortingOrder, type DocumentQuery, type Ref, type Space } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { markupToText } from '@hcengineering/text'
  import { Label, themeStore } from '@hcengineering/ui'
  import { translateCB } from '@hcengineering/platform'
  import { Hash, Search, X } from '@lucide/svelte'
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte'

  import { Button } from '../../../lib/components/ui/button'
  import { Skeleton } from '../../../lib/components/ui/skeleton'
  import { userSearch } from '../index'
  import { navigateToSpecial } from '../navigation'
  import { loadPlaces, type Place } from './places'
  import { searchScope } from './scope'
  import { searchStrings } from './strings'
  import { splitMatches } from './text'

  export let space: Ref<Space>
  export let name: string
  export let isChannel: boolean

  const RESULT_LIMIT = 50
  const DEBOUNCE_MS = 250

  const client = getClient()
  const dispatch = createEventDispatcher<{ select: ChatMessage, close: undefined }>()

  let query = ''
  let isEverywhere = false
  let places: Place[] = []
  let messages: ChatMessage[] = []
  let isLoading = false
  let activeIndex = -1
  let latestRequest = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let list: HTMLUListElement | undefined
  let input: HTMLInputElement | undefined
  let placeholder = ''

  $: translateCB(searchStrings.Placeholder, {}, $themeStore.language, (text) => { placeholder = text })
  $: text = query.trim()
  $: scheduleFetch(text, isEverywhere)
  $: placeById = new Map(places.map((place) => [place._id, place]))
  $: senders = getPersonByPersonIdStore([...new Set(messages.map((message) => message.createdBy ?? message.modifiedBy))])
  $: displayName = isChannel ? `#${name}` : name

  onMount(() => {
    const frame = requestAnimationFrame(() => input?.focus())
    return () => { cancelAnimationFrame(frame) }
  })
  onDestroy(() => { clearTimeout(timer) })

  function scheduleFetch (text: string, isEverywhere: boolean): void {
    clearTimeout(timer)
    latestRequest++
    activeIndex = -1
    if (text === '') {
      messages = []
      isLoading = false
      return
    }
    isLoading = true
    timer = setTimeout(() => { void fetchMessages(text, isEverywhere) }, DEBOUNCE_MS)
  }

  async function fetchMessages (text: string, isEverywhere: boolean): Promise<void> {
    const request = latestRequest
    if (isEverywhere && places.length === 0) places = await loadPlaces(client)
    const query: DocumentQuery<ChatMessage> = {
      space: isEverywhere ? { $in: places.map((place) => place._id) } : space,
      $search: text
    }
    const found = await client.findAll(chunter.class.ChatMessage, query, {
      sort: { createdOn: SortingOrder.Descending },
      limit: RESULT_LIMIT
    })
    if (request !== latestRequest) return
    messages = found
    isLoading = false
  }

  async function moveActive (step: number): Promise<void> {
    if (messages.length === 0) return
    activeIndex = activeIndex < 0 ? (step > 0 ? 0 : messages.length - 1) : (activeIndex + step + messages.length) % messages.length
    await tick()
    list?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }

  function onKeydown (event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      void moveActive(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter' && messages[activeIndex] !== undefined) {
      event.preventDefault()
      dispatch('select', messages[activeIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      dispatch('close')
    }
  }

  function openFullSearch (): void {
    if (!isEverywhere) searchScope.set(space)
    userSearch.set(text)
    navigateToSpecial('chunterBrowser')
  }

  function sentAt (message: ChatMessage, language: string): string {
    const sent = new Date(message.createdOn ?? message.modifiedOn)
    const now = new Date()
    if (sent.toDateString() === now.toDateString()) return sent.toLocaleTimeString(language, { timeStyle: 'short' })
    return sent.toLocaleDateString(language, {
      day: 'numeric',
      month: 'short',
      year: sent.getFullYear() === now.getFullYear() ? undefined : 'numeric'
    })
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-background">
  <div class="flex flex-col gap-2 border-b border-border p-3">
    <div class="flex items-center gap-1.5">
      <label class="relative flex min-w-0 flex-1 items-center">
        <span class="sr-only"><Label label={searchStrings.InConversation} /></span>
        <Search class="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          class="h-8 w-full min-w-0 rounded-lg border border-border bg-card pr-2 pl-8 text-[13px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
          {placeholder}
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          aria-expanded={messages.length > 0}
          aria-controls="channel-search-results"
          aria-activedescendant={activeIndex >= 0 ? `channel-search-${activeIndex}` : undefined}
          bind:this={input}
          bind:value={query}
          on:keydown={onKeydown}
        />
      </label>
      <Button variant="ghost" size="icon-sm" class="text-muted-foreground" onclick={() => dispatch('close')}>
        <X aria-hidden="true" />
        <span class="sr-only"><Label label={searchStrings.Close} /></span>
      </Button>
    </div>

    <div class="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5" role="group">
      {#each [false, true] as option (option)}
        <button
          type="button"
          class="h-6 min-w-0 truncate rounded-md px-2 text-xs font-medium outline-none transition-[background-color,color,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50 {isEverywhere === option
            ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(15_16_17/0.08)]'
            : 'text-muted-foreground hover:text-foreground'}"
          aria-pressed={isEverywhere === option}
          on:click={() => { isEverywhere = option }}
        >
          {#if option}<Label label={searchStrings.AllChats} />{:else}<Label label={searchStrings.ThisChat} />{/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if text === ''}
      <p class="m-0 px-4 py-10 text-center text-[13px] text-muted-foreground">
        {#if isEverywhere}
          <Label label={searchStrings.IdleEverywhere} />
        {:else}
          <Label label={searchStrings.IdleHere} params={{ name: displayName }} />
        {/if}
      </p>
    {:else if isLoading && messages.length === 0}
      <div class="grid gap-4 p-4" aria-busy="true">
        {#each [0, 1, 2] as row (row)}
          <div class="flex gap-2.5">
            <Skeleton class="size-6 rounded-full" />
            <div class="grid flex-1 gap-1.5"><Skeleton class="h-3 w-28" /><Skeleton class="h-3.5 w-full" /></div>
          </div>
        {/each}
      </div>
    {:else if messages.length === 0}
      <div class="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <p class="m-0 text-[13px] text-muted-foreground break-words">
          <Label label={searchStrings.NoMessagesFor} params={{ query: text }} />
        </p>
        {#if !isEverywhere}
          <Button variant="outline" size="sm" onclick={() => { isEverywhere = true }}>
            <Label label={searchStrings.SearchAllChats} />
          </Button>
        {/if}
      </div>
    {:else}
      <div class="flex items-center justify-between px-4 pt-3 pb-1">
        <span class="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          <Label label={searchStrings.MessageCount} params={{ count: messages.length }} />
        </span>
        <Button variant="link" size="xs" class="h-auto px-0" onclick={openFullSearch}>
          <Label label={searchStrings.MoreFilters} />
        </Button>
      </div>
      <ul
        id="channel-search-results"
        class="m-0 grid list-none gap-px px-1.5 pb-3"
        class:opacity-60={isLoading}
        role="listbox"
        bind:this={list}
      >
        {#each messages as message, index (message._id)}
          {@const sender = $senders.get(message.createdBy ?? message.modifiedBy)}
          {@const place = isEverywhere ? placeById.get(message.space) : undefined}
          <li id="channel-search-{index}" role="option" aria-selected={index === activeIndex}>
            <button
              type="button"
              tabindex="-1"
              class="flex w-full gap-2.5 rounded-md px-2.5 py-2 text-left outline-none hover:bg-muted {index === activeIndex
                ? 'bg-muted'
                : ''}"
              on:mouseenter={() => { activeIndex = index }}
              on:click={() => dispatch('select', message)}
            >
              <Avatar person={sender} name={sender?.name} size="x-small" variant="circle" />
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-baseline gap-1.5 text-xs">
                  <span class="truncate font-semibold text-foreground">{sender !== undefined ? getName(client.getHierarchy(), sender) : ''}</span>
                  {#if place !== undefined}
                    <span class="flex min-w-0 shrink items-center text-muted-foreground">
                      {#if !place.isDirect}<Hash class="size-3 shrink-0" aria-hidden="true" />{/if}<span class="truncate">{place.name}</span>
                    </span>
                  {/if}
                  <time class="ml-auto shrink-0 text-muted-foreground tabular-nums">{sentAt(message, $themeStore.language)}</time>
                </span>
                <span class="mt-0.5 line-clamp-2 text-[13px] leading-[1.45] text-foreground break-words whitespace-pre-line">
                  {#each splitMatches(markupToText(message.message), text) as part}
                    {#if part.isMatch}<mark class="rounded-[3px] bg-primary/15 px-px text-foreground">{part.text}</mark>{:else}{part.text}{/if}
                  {/each}
                </span>
                {#if message._class === chunter.class.ThreadMessage}
                  <span class="mt-0.5 block text-xs text-muted-foreground"><Label label={searchStrings.ThreadReply} /></span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
