<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Archive, FolderInput, MailOpen, Star, Trash2 } from '@lucide/svelte'
  import { tooltip } from '@hcengineering/ui'
  import type { MailFolderCard } from '@servone/mail'
  import * as DropdownMenu from '../../lib/components/ui/dropdown-menu'
  import { buttonVariants } from '../../lib/components/ui/button'
  import { folderLabel } from '../lib/commands'
  import { str, text } from '../plugin'

  export let count: number
  export let anyUnread: boolean
  export let anyUnstarred: boolean
  export let isTrash: boolean
  export let moveTargets: MailFolderCard[]

  const dispatch = createEventDispatcher<{
    toggleRead: void
    toggleStar: void
    archive: void
    delete: void
    moveTo: MailFolderCard
  }>()

</script>

<div class="bulk-bar">
  <span class="bulk-bar__count">{text('SelectedCount', { count })}</span>
  <button type="button" class="bulk-bar__button" use:tooltip={{ label: anyUnread ? str.MarkRead : str.MarkUnread }} aria-label={anyUnread ? text('MarkRead') : text('MarkUnread')} onclick={() => dispatch('toggleRead')}>
    <MailOpen size={16} />
  </button>
  <button type="button" class="bulk-bar__button" use:tooltip={{ label: anyUnstarred ? str.Star : str.Unstar }} aria-label={anyUnstarred ? text('Star') : text('Unstar')} onclick={() => dispatch('toggleStar')}>
    <Star size={16} />
  </button>
  {#if !isTrash}
    <button type="button" class="bulk-bar__button" use:tooltip={{ label: str.Archive }} aria-label={text('Archive')} onclick={() => dispatch('archive')}>
      <Archive size={16} />
    </button>
  {/if}
  <button type="button" class="bulk-bar__button" use:tooltip={{ label: isTrash ? str.DeleteForever : str.Delete }} aria-label={isTrash ? text('DeleteForever') : text('Delete')} onclick={() => dispatch('delete')}>
    <Trash2 size={16} />
  </button>
  <span use:tooltip={{ label: str.MoveTo }}>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} aria-label={text('MoveTo')}>
        <FolderInput size={16} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        {#each moveTargets as target (target._id)}
          <DropdownMenu.Item onSelect={() => dispatch('moveTo', target)}>
            {folderLabel(text, target)}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </span>
</div>

<style>
  .bulk-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
    padding: 0 8px;
  }
  .bulk-bar__count {
    margin-right: 8px;
    color: var(--theme-content-color);
    font-size: 13px;
    font-weight: 600;
  }
  .bulk-bar__button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--theme-content-color);
    cursor: pointer;
  }
  .bulk-bar__button:hover {
    background: var(--theme-button-hovered);
  }
</style>
