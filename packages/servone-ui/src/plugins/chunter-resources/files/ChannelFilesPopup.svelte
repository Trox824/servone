<script lang="ts">
  import attachment, { type Attachment } from '@hcengineering/attachment'
  import { getName, type Person } from '@hcengineering/contact'
  import { getPersonByPersonIdStore } from '@hcengineering/contact-resources'
  import type { Doc, DocumentQuery, PersonId, Ref, Space } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { createQuery, getClient, getFileUrl } from '@hcengineering/presentation'
  import { Label, navigate, showPopup, themeStore, tooltip } from '@hcengineering/ui'
  import { getObjectLinkFragment } from '@hcengineering/view-resources'
  import { File as FileIcon, HardDriveUpload, MessageSquare, Search } from '@lucide/svelte'
  import { createEventDispatcher, onMount } from 'svelte'

  import { buttonVariants } from '../../../lib/components/ui/button'
  import { menuScrollClass } from '../../../lib/menu-classes'
  import { cn } from '../../../lib/utils'
  import { showAttachmentPreviewPopup } from '../../attachment-resources/preview'
  import SaveToDrivePopup from '../../drive-resources/save-to-drive/SaveToDrivePopup.svelte'
  import { saveToDriveStrings } from '../../drive-resources/save-to-drive/strings'
  import { filesStrings } from './strings'

  export let channel: Doc

  const RECENT_LIMIT = 100
  const LINK_PREVIEW_TYPE = 'application/link-preview'
  const rowAction = cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'text-muted-foreground hover:bg-background')

  const dispatch = createEventDispatcher()
  const client = getClient()
  const filesQuery = createQuery()

  let files: Attachment[] = []
  let search = ''
  let searchPlaceholder = ''
  let searchInput: HTMLInputElement

  $: void translate(filesStrings.Search, {}, $themeStore.language).then((t) => (searchPlaceholder = t))

  $: {
    const query: DocumentQuery<Attachment> = {
      space: channel._id as Ref<Space>,
      type: { $ne: LINK_PREVIEW_TYPE }
    }
    if (search.trim() !== '') query.name = { $like: `%${search.trim()}%` }
    filesQuery.query(attachment.class.Attachment, query, (found) => (files = found), {
      sort: { createdOn: -1 },
      limit: RECENT_LIMIT
    })
  }

  $: senders = getPersonByPersonIdStore([...new Set(files.map(senderOf))])

  onMount(() => {
    searchInput.focus()
  })

  function senderOf (file: Attachment): PersonId {
    return file.createdBy ?? file.modifiedBy
  }

  function senderName (file: Attachment, people: Map<PersonId, Readonly<Person>>): string {
    const person = people.get(senderOf(file))
    return person !== undefined ? getName(client.getHierarchy(), person) : ''
  }

  function sentOn (file: Attachment): string {
    return new Date(file.createdOn ?? file.modifiedOn).toLocaleDateString($themeStore.language, { dateStyle: 'medium' })
  }

  function open (file: Attachment): void {
    dispatch('close')
    showAttachmentPreviewPopup(file)
  }

  async function jumpToMessage (file: Attachment): Promise<void> {
    const message = await client.findOne(file.attachedToClass, { _id: file.attachedTo })
    if (message === undefined) return
    dispatch('close')
    navigate(await getObjectLinkFragment(client.getHierarchy(), message))
  }

  function saveToDrive (file: Attachment): void {
    dispatch('close')
    showPopup(SaveToDrivePopup, { attachment: file }, 'top')
  }
</script>

<div class="flex w-[28rem] max-w-[90vw] flex-col gap-2 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
  <h2 class="m-0 px-2 pt-1 text-sm font-semibold"><Label label={filesStrings.Files} /></h2>
  <label class="flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
    <Search class="size-4 shrink-0 text-muted-foreground" />
    <input
      bind:this={searchInput}
      bind:value={search}
      type="search"
      placeholder={searchPlaceholder}
      aria-label={searchPlaceholder}
      class="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
    />
  </label>
  <ul class="{menuScrollClass} m-0 flex list-none flex-col p-0">
    {#each files as file (file._id)}
      <li class="group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted">
        <span class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
          {#if file.type.startsWith('image/')}
            <img src={getFileUrl(file.file, file.name)} alt="" loading="lazy" class="size-full object-cover" />
          {:else}
            <FileIcon size={16} />
          {/if}
        </span>
        <button
          type="button"
          class="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          on:click={() => open(file)}
        >
          <span class="block truncate text-sm font-medium">{file.name}</span>
          <span class="block truncate text-xs text-muted-foreground">{senderName(file, $senders)} · {sentOn(file)}</span>
        </button>
        <div class="relative flex shrink-0 items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" class={rowAction} use:tooltip={{ label: filesStrings.JumpToMessage }} on:click={() => jumpToMessage(file)}>
            <MessageSquare size={14} /><span class="sr-only"><Label label={filesStrings.JumpToMessage} /></span>
          </button>
          <button type="button" class={rowAction} use:tooltip={{ label: saveToDriveStrings.SaveToDrive }} on:click={() => saveToDrive(file)}>
            <HardDriveUpload size={14} /><span class="sr-only"><Label label={saveToDriveStrings.SaveToDrive} /></span>
          </button>
        </div>
      </li>
    {:else}
      <li class="px-2 py-8 text-center text-sm text-muted-foreground"><Label label={filesStrings.Empty} /></li>
    {/each}
  </ul>
</div>
