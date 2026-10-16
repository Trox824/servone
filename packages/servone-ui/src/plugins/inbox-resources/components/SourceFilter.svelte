<script lang="ts">
  import { onMount } from 'svelte'
  import { ListFilter } from '@lucide/svelte'
  import { getMetadata, type IntlString } from '@hcengineering/platform'
  import presentation, { getClient } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import { Button, buttonVariants } from '../../../lib/components/ui/button'
  import * as Popover from '../../../lib/components/ui/popover'
  import { Badge } from '../../../lib/components/ui/badge'
  import { Checkbox } from '../../../lib/components/ui/checkbox'
  import { cn } from '../../../lib/utils'
  import { readHidden, writeHidden, type KeyStore } from '../source-filter'
  import { hiddenSources, isUnreadOnly, loadedSources, type Source } from '../source-filter-state'

  const FILTER = 'notification:string:ServoneInboxFilter' as IntlString
  const TITLE = 'notification:string:ServoneInboxFilterTitle' as IntlString
  const SHOW_ALL = 'notification:string:ServoneInboxShowAll' as IntlString
  const UNREAD_ONLY = 'notification:string:ServoneInboxUnreadOnly' as IntlString
  const THREAD_REPLIES = 'notification:string:ServoneInboxThreadReplies' as IntlString

  const THREAD_REPLIES_SOURCE = 'chunter:class:ChatMessage'

  const hierarchy = getClient().getHierarchy()
  const workspace = getMetadata(presentation.metadata.WorkspaceUuid) ?? ''
  const browserStore: KeyStore = {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, text) => { localStorage.setItem(key, text) }
  }

  let isRestored = false
  onMount(() => {
    hiddenSources.set(readHidden<Source>(browserStore, workspace))
    isRestored = true
  })
  $: if (isRestored) writeHidden(browserStore, workspace, $hiddenSources)

  function setShown (source: Source, isShown: boolean): void {
    const next = new Set($hiddenSources)
    if (isShown) next.delete(source)
    else next.add(source)
    hiddenSources.set(next)
  }

  function showAll (): void {
    hiddenSources.set(new Set())
    isUnreadOnly.set(false)
  }

  $: activeCount = $hiddenSources.size + ($isUnreadOnly ? 1 : 0)
</script>

<Popover.Root>
  <Popover.Trigger
    class={cn(buttonVariants({ variant: activeCount > 0 ? 'secondary' : 'ghost', size: activeCount > 0 ? 'sm' : 'icon-sm' }), 'tabular-nums')}
  >
    <ListFilter />
    {#if activeCount > 0}{activeCount}{/if}
    <span class="sr-only"><Label label={FILTER} /></span>
  </Popover.Trigger>
  <Popover.Content align="end" class="w-64 gap-0 p-0">
    <div class="flex h-10 items-center justify-between gap-2 border-b pl-3 pr-1.5 text-sm font-medium">
      <Label label={TITLE} />
      {#if activeCount > 0}
        <Button variant="ghost" size="xs" onclick={showAll}><Label label={SHOW_ALL} /></Button>
      {/if}
    </div>
    <label class="m-1 flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent">
      <Checkbox checked={$isUnreadOnly} onCheckedChange={(isChecked) => { isUnreadOnly.set(isChecked) }} />
      <span class="min-w-0 flex-1 truncate"><Label label={UNREAD_ONLY} /></span>
    </label>
    <div class="border-b" />
    <ul class="m-0 grid max-h-72 list-none overflow-y-auto p-1">
      {#each $loadedSources as { source, count } (source)}
        {@const label = hierarchy.findClass(source)?.label}
        <li>
          <label class="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent">
            <Checkbox checked={!$hiddenSources.has(source)} onCheckedChange={(isShown) => { setShown(source, isShown) }} />
            <span class="min-w-0 flex-1 truncate">{#if source === THREAD_REPLIES_SOURCE}<Label label={THREAD_REPLIES} />{:else if label !== undefined}<Label {label} />{:else}{source}{/if}</span>
            <Badge variant="secondary" class="tabular-nums">{count}</Badge>
          </label>
        </li>
      {/each}
    </ul>
  </Popover.Content>
</Popover.Root>
