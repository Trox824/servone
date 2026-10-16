<script lang="ts">
  import attachment, { type Attachment } from '@hcengineering/attachment'
  import {
    dateFileBrowserFilters,
    FileBrowserSortMode,
    fileTypeFileBrowserFilters,
    sortModeToOptionObject
  } from '@hcengineering/attachment-resources'
  import attachmentPlg from '@hcengineering/attachment-resources/src/plugin'
  import { getName, type Person } from '@hcengineering/contact'
  import { getPersonByPersonIdStore } from '@hcengineering/contact-resources'
  import type { DocumentQuery, PersonId, Ref, Space } from '@hcengineering/core'
  import { getClient, getFileUrl } from '@hcengineering/presentation'
  import { Label, navigate, showPopup, themeStore, tooltip } from '@hcengineering/ui'
  import { getObjectLinkFragment } from '@hcengineering/view-resources'
  import { Download, File as FileIcon, FileAudio, FileText, FileVideo, HardDriveUpload, MessageSquare } from '@lucide/svelte'
  import { onMount } from 'svelte'

  import { Button, buttonVariants } from '../../../lib/components/ui/button'
  import { Skeleton } from '../../../lib/components/ui/skeleton'
  import { cn } from '../../../lib/utils'
  import { showAttachmentPreviewPopup } from '../../attachment-resources/preview'
  import SaveToDrivePopup from '../../drive-resources/save-to-drive/SaveToDrivePopup.svelte'
  import { saveToDriveStrings } from '../../drive-resources/save-to-drive/strings'
  import { filesStrings } from '../files/strings'
  import ChoiceFilter from './ChoiceFilter.svelte'
  import PeopleFilter from './PeopleFilter.svelte'
  import PlaceFilter from './PlaceFilter.svelte'
  import { loadPlaces, socialIdsOf, type Place } from './places'
  import { searchScope } from './scope'
  import { searchStrings } from './strings'
  import { formatBytes } from './text'

  export let search = ''

  const RESULT_LIMIT = 200
  const LINK_PREVIEW_TYPE = 'application/link-preview'
  const ANY_DATE = 'dateAny'
  const ANY_TYPE = 'typeAny'
  const sortOptions = [
    { id: String(FileBrowserSortMode.NewestFile), label: attachmentPlg.string.FileBrowserSortNewest },
    { id: String(FileBrowserSortMode.OldestFile), label: attachmentPlg.string.FileBrowserSortOldest },
    { id: String(FileBrowserSortMode.AscendingAlphabetical), label: attachmentPlg.string.FileBrowserSortAZ },
    { id: String(FileBrowserSortMode.BiggestSize), label: attachmentPlg.string.FileBrowserSortBiggest }
  ]

  const client = getClient()
  let places: Place[] = []
  let people: Array<Ref<Person>> = []
  let selectedPlaces: Array<Ref<Space>> = []
  let dateId = ANY_DATE
  let typeId = ANY_TYPE
  let sortId = sortOptions[0].id
  let files: Attachment[] = []
  let isLoading = true
  let latestRequest = 0

  const rowAction = cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'text-muted-foreground hover:bg-background')

  onMount(async () => {
    places = await loadPlaces(client)
  })

  $: if ($searchScope !== undefined) {
    selectedPlaces = [$searchScope]
    searchScope.set(undefined)
  }
  $: placeById = new Map(places.map((place) => [place._id, place]))
  $: hasFilters = people.length > 0 || selectedPlaces.length > 0 || dateId !== ANY_DATE || typeId !== ANY_TYPE
  $: if (places.length > 0) void fetchFiles(search.trim(), people, selectedPlaces, dateId, typeId, sortId)
  $: senders = getPersonByPersonIdStore([...new Set(files.map(senderOf))])

  async function fetchFiles (
    text: string,
    from: Array<Ref<Person>>,
    within: Array<Ref<Space>>,
    date: string,
    type: string,
    sort: string
  ): Promise<void> {
    const request = ++latestRequest
    isLoading = true
    const query: DocumentQuery<Attachment> = {
      space: { $in: within.length > 0 ? within : places.map((place) => place._id) },
      type: fileTypeFileBrowserFilters.find((option) => option.id === type)?.getType() ?? { $ne: LINK_PREVIEW_TYPE }
    }
    if (text !== '') query.name = { $like: `%${text}%` }
    const modifiedOn = dateFileBrowserFilters.find((option) => option.id === date)?.getDate()
    if (modifiedOn !== undefined) query.modifiedOn = modifiedOn
    if (from.length > 0) query.modifiedBy = { $in: await socialIdsOf(client, from) }
    const found = await client.findAll(attachment.class.Attachment, query, {
      sort: sortModeToOptionObject(Number(sort) as FileBrowserSortMode),
      limit: RESULT_LIMIT
    })
    if (request !== latestRequest) return
    files = found
    isLoading = false
  }

  function clearFilters (): void {
    people = []
    selectedPlaces = []
    dateId = ANY_DATE
    typeId = ANY_TYPE
  }

  function senderOf (file: Attachment): PersonId {
    return file.createdBy ?? file.modifiedBy
  }

  function placeLabel (file: Attachment): string {
    const place = placeById.get(file.space)
    if (place === undefined) return ''
    return place.isDirect ? place.name : `#${place.name}`
  }

  function sharedOn (file: Attachment, language: string): string {
    return new Date(file.createdOn ?? file.modifiedOn).toLocaleDateString(language, { dateStyle: 'medium' })
  }

  async function jumpToMessage (file: Attachment): Promise<void> {
    const message = await client.findOne(file.attachedToClass, { _id: file.attachedTo })
    if (message === undefined) return
    navigate(await getObjectLinkFragment(client.getHierarchy(), message))
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2.5">
    <PeopleFilter bind:selected={people} />
    <PlaceFilter {places} bind:selected={selectedPlaces} />
    <ChoiceFilter label={searchStrings.Date} options={dateFileBrowserFilters} anyId={ANY_DATE} bind:selected={dateId} />
    <ChoiceFilter label={searchStrings.Type} options={fileTypeFileBrowserFilters} anyId={ANY_TYPE} bind:selected={typeId} />
    {#if hasFilters}
      <Button variant="ghost" size="sm" class="text-muted-foreground" onclick={clearFilters}>
        <Label label={searchStrings.ClearFilters} />
      </Button>
    {/if}
    <div class="ml-auto flex items-center gap-2">
      <span class="text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {#if !isLoading}<Label label={searchStrings.FileCount} params={{ count: files.length }} />{/if}
      </span>
      <ChoiceFilter label={attachmentPlg.string.FileBrowserSort} options={sortOptions} bind:selected={sortId} />
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
    {#if isLoading && files.length === 0}
      <div class="grid gap-1 px-3 py-2" aria-busy="true">
        {#each [0, 1, 2, 3, 4] as row (row)}
          <div class="flex h-12 items-center gap-3">
            <Skeleton class="size-9 rounded-md" />
            <div class="grid flex-1 gap-1.5"><Skeleton class="h-3.5 w-64" /><Skeleton class="h-3 w-44" /></div>
          </div>
        {/each}
      </div>
    {:else if files.length === 0}
      <div class="mx-auto flex max-w-sm flex-col items-center gap-1 py-20 text-center">
        <p class="m-0 text-sm font-medium"><Label label={searchStrings.NoFiles} /></p>
        <p class="m-0 text-sm text-muted-foreground"><Label label={searchStrings.TryAgain} /></p>
        {#if hasFilters}
          <Button variant="outline" size="sm" class="mt-3" onclick={clearFilters}><Label label={searchStrings.ClearFilters} /></Button>
        {/if}
      </div>
    {:else}
      <ul class="m-0 grid list-none gap-px p-0" class:opacity-60={isLoading}>
        {#each files as file (file._id)}
          {@const sender = $senders.get(senderOf(file))}
          <li class="group relative flex min-h-13 items-center gap-3 rounded-md px-3 py-2 hover:bg-muted">
            <span class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
              {#if file.type.startsWith('image/')}
                <img src={getFileUrl(file.file, file.name)} alt="" loading="lazy" class="size-full object-cover" />
              {:else if file.type.startsWith('video/')}
                <FileVideo class="size-4" />
              {:else if file.type.startsWith('audio/')}
                <FileAudio class="size-4" />
              {:else if file.type === 'application/pdf' || file.type.startsWith('text/')}
                <FileText class="size-4" />
              {:else}
                <FileIcon class="size-4" />
              {/if}
            </span>
            <button
              type="button"
              class="min-w-0 flex-1 rounded-sm text-left outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
              on:click={() => { showAttachmentPreviewPopup(file) }}
            >
              <span class="block truncate text-sm font-medium">{file.name}</span>
              <span class="block truncate text-xs text-muted-foreground">
                {sender !== undefined ? getName(client.getHierarchy(), sender) : ''}
                {#if placeLabel(file) !== ''}<span aria-hidden="true"> · </span>{placeLabel(file)}{/if}
                <span aria-hidden="true"> · </span>{sharedOn(file, $themeStore.language)}
                {#if file.size > 0}<span aria-hidden="true"> · </span><span class="tabular-nums">{formatBytes(file.size, $themeStore.language)}</span>{/if}
              </span>
            </button>
            <div class="relative flex shrink-0 items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
              <button type="button" class={rowAction} use:tooltip={{ label: filesStrings.JumpToMessage }} on:click={() => jumpToMessage(file)}>
                <MessageSquare /><span class="sr-only"><Label label={filesStrings.JumpToMessage} /></span>
              </button>
              <button
                type="button"
                class={rowAction}
                use:tooltip={{ label: saveToDriveStrings.SaveToDrive }}
                on:click={() => showPopup(SaveToDrivePopup, { attachment: file }, 'top')}
              >
                <HardDriveUpload /><span class="sr-only"><Label label={saveToDriveStrings.SaveToDrive} /></span>
              </button>
              <a class={rowAction} href={getFileUrl(file.file, file.name)} download={file.name} use:tooltip={{ label: searchStrings.Download }}>
                <Download /><span class="sr-only"><Label label={searchStrings.Download} /></span>
              </a>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
