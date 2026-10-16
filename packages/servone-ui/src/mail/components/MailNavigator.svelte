<script lang="ts">
  import type { ComponentType } from 'svelte'
  import { Archive, ChevronsUpDown, File, Inbox, Send, ShieldAlert, Tag, Trash2 } from '@lucide/svelte'
  import { ButtonIcon, deviceOptionsStore as deviceInfo, IconEdit, NavItem, Scroller } from '@hcengineering/ui'
  import NavFooter from '../../plugins/workbench-resources/components/NavFooter.svelte'
  import { languageStore } from '@hcengineering/theme'
  import type { AccountStatus, FolderRole, MailAccountCard, MailFolderCard } from '@servone/mail'
  import { orderFolders } from '../lib/folders'
  import { folderLabel } from '../lib/commands'
  import { openNewMail } from '../lib/compose-popup'
  import { openReconnect } from '../lib/reconnect'
  import { getMailState } from '../state'
  import * as DropdownMenu from '../../lib/components/ui/dropdown-menu'
  import DisconnectPopup from './DisconnectPopup.svelte'
  import { str, text } from '../plugin'
  import type { StringKey } from '../strings'

  export let account: MailAccountCard

  const { folders, folder, thread, selection } = getMailState()

  let isDisconnectOpen = false

  const FOLDER_ICONS: Partial<Record<FolderRole, ComponentType>> = {
    inbox: Inbox,
    sent: Send,
    drafts: File,
    archive: Archive,
    trash: Trash2,
    spam: ShieldAlert
  }

  const STATUS_COLOR: Record<AccountStatus, string> = {
    ready: 'var(--global-online-color)',
    backfilling: 'var(--theme-warning-color)',
    connecting: 'var(--theme-warning-color)',
    'auth-error': 'var(--highlight-red)',
    offline: 'var(--global-offline-color)',
    removing: 'var(--global-offline-color)'
  }

  const STATUS_LABEL_KEY: Record<AccountStatus, StringKey> = {
    ready: 'StatusReady',
    connecting: 'StatusConnecting',
    backfilling: 'StatusBackfilling',
    'auth-error': 'StatusAuthError',
    offline: 'StatusOffline',
    removing: 'StatusRemoving'
  }

  function iconFor (candidate: MailFolderCard): ComponentType {
    return FOLDER_ICONS[candidate.mailRole] ?? Tag
  }

  function selectFolder (target: MailFolderCard): void {
    folder.set(target._id)
    thread.set(undefined)
    selection.set({ cursor: undefined, picked: new Set() })
    if ($deviceInfo.isMobile) $deviceInfo.navigator.visible = false
  }

  $: rows = $folders !== undefined ? orderFolders($folders) : []
  $: canReconnect = account.mailStatus === 'auth-error' || account.mailStatus === 'offline'
</script>

<div class="hulyNavPanel-header withButton">
  <span class="overflow-label">{text('Mail')}</span>
  <ButtonIcon
    icon={IconEdit}
    kind={'primary'}
    size={'small'}
    tooltip={{ label: str.ComposeNew }}
    on:click={() => { openNewMail(account, $languageStore) }}
  />
</div>

<Scroller shrink>
  <nav class="mail-navigator__folders" aria-label={text('Folders')}>
    {#each rows as row (row._id)}
      <NavItem
        _id={row._id}
        icon={iconFor(row)}
        title={folderLabel(text, row)}
        count={row.mailUnread > 0 ? row.mailUnread : null}
        selected={$folder === row._id}
        on:click={() => { selectFolder(row) }}
      >
        <svelte:fragment slot="icon">
          <svelte:component this={iconFor(row)} size={16} />
        </svelte:fragment>
      </NavItem>
    {/each}
  </nav>
</Scroller>

<NavFooter>
  <DropdownMenu.Root>
    <DropdownMenu.Trigger class="hulyNavItem-container font-regular-14 mail-navigator__account">
      <span class="mail-navigator__account-icon">
        <span class="mail-navigator__status-dot" style:background={STATUS_COLOR[account.mailStatus]}></span>
      </span>
      <span class="overflow-label mail-navigator__account-email">{account.mailEmail}</span>
      <span class="sr-only">{text(STATUS_LABEL_KEY[account.mailStatus])}</span>
      <ChevronsUpDown size={14} class="mail-navigator__chevron" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content side="top" align="start">
      <DropdownMenu.Label>
        <div class="mail-navigator__menu-email">{account.mailEmail}</div>
        <div class="mail-navigator__menu-status">
          <span class="mail-navigator__status-dot" style:background={STATUS_COLOR[account.mailStatus]}></span>
          {text(STATUS_LABEL_KEY[account.mailStatus])}
        </div>
      </DropdownMenu.Label>
      <DropdownMenu.Separator />
      {#if canReconnect}
        <DropdownMenu.Item onSelect={() => { openReconnect(account) }}>{text('Reconnect')}</DropdownMenu.Item>
      {/if}
      <DropdownMenu.Item variant="destructive" onSelect={() => { isDisconnectOpen = true }}>{text('DisconnectItem')}</DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
</NavFooter>

{#if isDisconnectOpen}
  <DisconnectPopup {account} bind:open={isDisconnectOpen} />
{/if}

<style>
  .mail-navigator__folders {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  /* Both classes land on elements rendered by other components, outside this component's scope. */
  /* NavItem's row styles are scoped to NavItem; these mirror its type-link metrics. */
  :global(.mail-navigator__account) {
    display: flex;
    align-items: center;
    min-height: var(--global-small-Size);
    padding: 0 var(--spacing-0_5) 0 var(--spacing-1_25);
    border-radius: var(--small-BorderRadius);
    text-align: left;
  }
  :global(.mail-navigator__account:hover) {
    background-color: var(--global-ui-hover-highlight-BackgroundColor);
  }
  .mail-navigator__account-icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: var(--global-min-Size);
    height: var(--global-min-Size);
    margin-right: var(--spacing-1);
  }
  .mail-navigator__account-email {
    flex-grow: 1;
    color: var(--global-primary-TextColor);
  }
  :global(.mail-navigator__chevron) {
    flex-shrink: 0;
    color: var(--theme-halfcontent-color);
  }
  .mail-navigator__status-dot {
    display: inline-block;
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .mail-navigator__menu-email {
    overflow: hidden;
    color: var(--theme-caption-color);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mail-navigator__menu-status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    color: var(--theme-dark-color);
    font-size: 12px;
    font-weight: 400;
  }
</style>
