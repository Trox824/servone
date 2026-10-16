<script lang="ts">
  import { dateFileBrowserFilters } from '@hcengineering/attachment-resources'
  import attachmentPlg from '@hcengineering/attachment-resources/src/plugin'
  import chunter, { type ChatMessage } from '@hcengineering/chunter'
  import { getName, type Person } from '@hcengineering/contact'
  import { Avatar, getPersonByPersonIdStore } from '@hcengineering/contact-resources'
  import { SortingOrder, type DocumentQuery, type Ref, type Space } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { markupToText } from '@hcengineering/text'
  import { Label, themeStore } from '@hcengineering/ui'
  import { Hash, MessagesSquare, Paperclip } from '@lucide/svelte'
  import { onMount } from 'svelte'

  import { Button } from '../../../lib/components/ui/button'
  import { Skeleton } from '../../../lib/components/ui/skeleton'
  import { openMessageFromSpecial } from '../navigation'
  import ChoiceFilter from './ChoiceFilter.svelte'
  import PeopleFilter from './PeopleFilter.svelte'
  import PlaceFilter from './PlaceFilter.svelte'
  import { loadPlaces, socialIdsOf, type Place } from './places'
  import { searchScope } from './scope'
  import { searchStrings } from './strings'
  import { splitMatches } from './text'

  export let search = ''

  const RESULT_LIMIT = 100
  const ANY_DATE = 'dateAny'
  const NEWEST = 'newest'
  const sortOptions = [
    { id: NEWEST, label: searchStrings.Newest },
    { id: 'oldest', label: searchStrings.Oldest }
  ]

  const client = getClient()
  let places: Place[] = []
  let people: Array<Ref<Person>> = []
  let selectedPlaces: Array<Ref<Space>> = []
  let dateId = ANY_DATE
  let sortId = NEWEST
  let messages: ChatMessage[] = []
  let isLoading = true
  let latestRequest = 0

  onMount(async () => {
    places = await loadPlaces(client)
  })

  $: text = search.trim()
  $: if ($searchScope !== undefined) {
    selectedPlaces = [$searchScope]
    searchScope.set(undefined)
  }
  $: placeById = new Map(places.map((place) => [place._id, place]))
  $: hasFilters = people.length > 0 || selectedPlaces.length > 0 || dateId !== ANY_DATE
  $: isIdle = text === '' && !hasFilters
  $: if (places.length > 0 && !isIdle) void fetchMessages(text, people, selectedPlaces, dateId, sortId)
  $: senders = getPersonByPersonIdStore([...new Set(messages.map((message) => message.createdBy ?? message.modifiedBy))])

  async function fetchMessages (
    text: string,
    from: Array<Ref<Person>>,
    within: Array<Ref<Space>>,
    date: string,
    sort: string
  ): Promise<void> {
    const request = ++latestRequest
    isLoading = true
    const query: DocumentQuery<ChatMessage> = {
      space: { $in: within.length > 0 ? within : places.map((place) => place._id) }
    }
    if (text !== '') query.$search = text
    const createdOn = dateFileBrowserFilters.find((option) => option.id === date)?.getDate()
    if (createdOn !== undefined) query.createdOn = createdOn
    if (from.length > 0) query.createdBy = { $in: await socialIdsOf(client, from) }
    const found = await client.findAll(chunter.class.ChatMessage, query, {
      sort: { createdOn: sort === NEWEST ? SortingOrder.Descending : SortingOrder.Ascending },
      limit: RESULT_LIMIT
    })
    if (request !== latestRequest) return
    messages = found
    isLoading = false
  }

  function clearFilters (): void {
    people = []
    selectedPlaces = []
    dateId = ANY_DATE
  }

  function sentAt (message: ChatMessage, language: string): string {
    return new Date(message.createdOn ?? message.modifiedOn).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' })
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2.5">
    <PeopleFilter bind:selected={people} />
    <PlaceFilter {places} bind:selected={selectedPlaces} />
    <ChoiceFilter label={searchStrings.Date} options={dateFileBrowserFilters} anyId={ANY_DATE} bind:selected={dateId} />
    {#if hasFilters}
      <Button variant="ghost" size="sm" class="text-muted-foreground" onclick={clearFilters}>
        <Label label={searchStrings.ClearFilters} />
      </Button>
    {/if}
    <div class="ml-auto flex items-center gap-2">
      <span class="text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {#if !isIdle && !isLoading}<Label label={searchStrings.MessageCount} params={{ count: messages.length }} />{/if}
      </span>
      <ChoiceFilter label={attachmentPlg.string.FileBrowserSort} options={sortOptions} bind:selected={sortId} />
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
    {#if isIdle}
      <div class="mx-auto flex max-w-sm flex-col items-center gap-2 py-20 text-center text-muted-foreground">
        <MessagesSquare class="size-5" />
        <p class="m-0 text-sm"><Label label={searchStrings.StartTyping} /></p>
      </div>
    {:else if isLoading && messages.length === 0}
      <div class="grid gap-4 px-3 py-3" aria-busy="true">
        {#each [0, 1, 2, 3] as row (row)}
          <div class="flex gap-3">
            <Skeleton class="size-7 rounded-full" />
            <div class="grid flex-1 gap-1.5"><Skeleton class="h-3 w-40" /><Skeleton class="h-3.5 w-3/4" /></div>
          </div>
        {/each}
      </div>
    {:else if messages.length === 0}
      <div class="mx-auto flex max-w-sm flex-col items-center gap-1 py-20 text-center">
        <p class="m-0 text-sm font-medium"><Label label={searchStrings.NoMessages} /></p>
        <p class="m-0 text-sm text-muted-foreground"><Label label={searchStrings.TryAgain} /></p>
        {#if hasFilters}
          <Button variant="outline" size="sm" class="mt-3" onclick={clearFilters}><Label label={searchStrings.ClearFilters} /></Button>
        {/if}
      </div>
    {:else}
      <ul class="m-0 grid list-none gap-px p-0" class:opacity-60={isLoading}>
        {#each messages as message (message._id)}
          {@const sender = $senders.get(message.createdBy ?? message.modifiedBy)}
          {@const place = placeById.get(message.space)}
          <li>
            <button
              type="button"
              class="flex w-full gap-3 rounded-md px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              on:click={() => openMessageFromSpecial(message)}
            >
              <Avatar person={sender} name={sender?.name} size="smaller" variant="circle" />
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-baseline gap-2">
                  <span class="truncate text-sm font-semibold">{sender !== undefined ? getName(client.getHierarchy(), sender) : ''}</span>
                  {#if place !== undefined}
                    <span class="flex min-w-0 shrink items-center gap-0.5 text-xs text-muted-foreground">
                      {#if !place.isDirect}<Hash class="size-3 shrink-0" />{/if}<span class="truncate">{place.name}</span>
                    </span>
                  {/if}
                  {#if message._class === chunter.class.ThreadMessage}
                    <span class="shrink-0 text-xs text-muted-foreground"><Label label={searchStrings.ThreadReply} /></span>
                  {/if}
                  <time class="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{sentAt(message, $themeStore.language)}</time>
                </span>
                <span class="mt-0.5 line-clamp-3 text-sm break-words whitespace-pre-line">
                  {#each splitMatches(markupToText(message.message), text) as part}
                    {#if part.isMatch}<mark class="rounded-xs bg-primary/15 px-px font-medium text-foreground">{part.text}</mark>{:else}{part.text}{/if}
                  {/each}
                </span>
                {#if (message.attachments ?? 0) > 0}
                  <span class="mt-1 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                    <Paperclip class="size-3" />{message.attachments}
                  </span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
