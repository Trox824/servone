<script lang="ts">
  import { AccountRole, type Doc, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import {
    type Action,
    ButtonIcon,
    IconAdd,
    IconDown,
    IconFolderCollapsed,
    IconUp,
    Label,
    Menu,
    Scroller,
    showPopup
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { getClient, MessageBox } from '@hcengineering/presentation'
  import { get } from 'svelte/store'
  import type { SpecialNavModel } from '@hcengineering/workbench'
  import { NavFooter } from '@hcengineering/workbench-resources'
  import { getEmbeddedLabel, getResource } from '@hcengineering/platform'
  import { InboxNotificationsClientImpl, NotifyMarker } from '@hcengineering/notification-resources'
  import { Search } from '@lucide/svelte'
  import type { ChatNavGroupModel } from '../types'
  import chunter from '../../../plugin'
  import ChatNavGroup from './ChatNavGroup.svelte'
  import { chatNavGroupModels } from '../utils'
  import QuickSwitcher from '../../../slack-shortcuts/QuickSwitcher.svelte'
  import { shortcutStrings } from '../../../slack-shortcuts/strings'
  import { navigateToSpecial } from '../../../navigation'
  import { canCreateChannel } from '../../../../../lib/chat/create-policy'
  import type { ChatSection } from '../../../../../lib/chat/sections'
  import { roleCapabilitySettings } from '../../../settings/createPolicy'
  import { provideSections, sectionString } from '../../../sections/store'
  import { askSectionName, createSection, deleteSection, moveSection, renameSection } from '../../../sections/actions'

  export let object: Doc | undefined
  export let currentSpecial: SpecialNavModel | undefined

  const client = getClient()
  const inboxClient = InboxNotificationsClientImpl.getClient()
  const notificationsByContext = inboxClient.inboxNotificationsByContext
  const notifyContexts = inboxClient.contexts
  const currentAccount = getCurrentAccount()
  const mayUseAddMenu = hasAccountRole(currentAccount, AccountRole.User)
  const capabilitySettings = roleCapabilitySettings()
  const customSections = provideSections()

  let unreadThreadCount = 0
  let isAddMenuOpen = false

  $: void refreshUnreadThreads($notificationsByContext)

  async function refreshUnreadThreads (contextMap: typeof $notificationsByContext): Promise<void> {
    const countThreads = await getResource(chunter.function.GetUnreadThreadsCount)
    unreadThreadCount = countThreads(contextMap)
  }

  $: mayCreateChannels = canCreateChannel(currentAccount, $capabilitySettings?.roleByCapability)

  $: groupModels = chatNavGroupModels.map(
    (model): ChatNavGroupModel =>
      model.id === 'channels' && !mayCreateChannels ? { ...model, getActionsFn: undefined } : model
  )
  $: starredModel = groupModels[0]
  $: remainingModels = groupModels.slice(1)

  function openAddMenu (event: MouseEvent): void {
    isAddMenuOpen = true
    showPopup(Menu, { actions: addMenuEntries }, event.currentTarget as HTMLElement, () => {
      isAddMenuOpen = false
    })
  }

  $: addMenuEntries = buildAddMenuEntries(mayCreateChannels, $customSections)

  function buildAddMenuEntries (canMakeChannels: boolean, sections: ChatSection[]): Action[] {
    const newChannelEntries: Action[] = canMakeChannels
      ? [
          {
            label: chunter.string.NewChannel,
            icon: chunter.icon.Hashtag,
            action: async () => {
              showPopup(chunter.component.CreateChannel, {}, 'top')
            }
          }
        ]
      : []
    return [
      ...newChannelEntries,
      {
        label: chunter.string.NewDirectChat,
        icon: chunter.icon.Thread,
        action: async () => {
          showPopup(chunter.component.CreateDirectChat, {}, 'top')
        }
      },
      {
        label: chunter.string.ChannelBrowser,
        icon: chunter.icon.ChannelBrowser,
        action: async () => {
          navigateToSpecial('channels')
        }
      },
      {
        label: sectionString.NewSection,
        icon: IconFolderCollapsed,
        action: async () => {
          const name = await askSectionName(sectionString.NewSection)
          if (name !== undefined) await createSection(client, name, sections)
        }
      }
    ]
  }

  function buildSectionMenu (section: ChatSection, position: number, total: number): Action[] {
    const renameEntry: Action = {
      label: sectionString.RenameSection,
      icon: view.icon.Edit,
      action: async () => {
        const name = await askSectionName(sectionString.RenameSection, section.name)
        if (name !== undefined && name !== section.name) await renameSection(client, section._id, name)
      }
    }
    const moveUpEntries: Action[] =
      position > 0
        ? [
            {
              label: sectionString.MoveUp,
              icon: IconUp,
              action: async () => {
                await moveSection(client, $customSections, section._id, 'up')
              }
            }
          ]
        : []
    const moveDownEntries: Action[] =
      position < total - 1
        ? [
            {
              label: sectionString.MoveDown,
              icon: IconDown,
              action: async () => {
                await moveSection(client, $customSections, section._id, 'down')
              }
            }
          ]
        : []
    const deleteEntry: Action = {
      label: sectionString.DeleteSection,
      icon: view.icon.Delete,
      action: async () => {
        showPopup(MessageBox, {
          label: sectionString.DeleteSection,
          message: sectionString.DeleteSectionHint,
          dangerous: true,
          action: async () => {
            await deleteSection(client, section._id, get(notifyContexts))
          }
        })
      }
    }
    return [renameEntry, ...moveUpEntries, ...moveDownEntries, deleteEntry]
  }

  function buildSectionModel (section: ChatSection, position: number, total: number): ChatNavGroupModel {
    return {
      id: 'channels',
      label: getEmbeddedLabel(section.name),
      sortFn: starredModel.sortFn,
      wrap: false,
      isPinned: false,
      getActionsFn: () => buildSectionMenu(section, position, total)
    }
  }
</script>

<div class="hulyNavPanel-header withButton">
  <div class="overflow-label"><Label label={chunter.string.Chat} /></div>
  <div class="flex-row-center flex-gap-1">
    <div class="relative">
      <ButtonIcon
        icon={chunter.icon.Thread}
        kind={'tertiary'}
        size={'small'}
        pressed={currentSpecial?.id === 'threads'}
        tooltip={{ label: chunter.string.Threads }}
        on:click={() => {
          navigateToSpecial('threads')
        }}
      />
      {#if unreadThreadCount > 0}
        <div class="pointer-events-none absolute -right-1 -top-1">
          <NotifyMarker count={unreadThreadCount} />
        </div>
      {/if}
    </div>
    <ButtonIcon
      icon={chunter.icon.Bookmarks}
      kind={'tertiary'}
      size={'small'}
      pressed={currentSpecial?.id === 'saved'}
      tooltip={{ label: chunter.string.Saved }}
      on:click={() => {
        navigateToSpecial('saved')
      }}
    />
    {#if mayUseAddMenu}
      <ButtonIcon icon={IconAdd} hasMenu kind={'primary'} size={'small'} pressed={isAddMenuOpen} on:click={openAddMenu} />
    {/if}
  </div>
</div>

<div class="border-b p-[var(--spacing-1_5)]" style:border-bottom-color="var(--theme-navpanel-divider)">
  <button
    type="button"
    class="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground hover:bg-accent"
    on:click={() => {
      showPopup(QuickSwitcher, {}, 'top')
    }}
  >
    <Search size={14} />
    <span class="flex-1 truncate text-left"><Label label={shortcutStrings.SearchOrJump} /></span>
  </button>
</div>

<Scroller shrink>
  <ChatNavGroup {object} model={starredModel} on:select />
  {#each $customSections as section, position (section._id)}
    <ChatNavGroup
      {object}
      model={buildSectionModel(section, position, $customSections.length)}
      sectionId={section._id}
      on:select
    />
  {/each}
  {#each remainingModels as model (model.id)}
    <ChatNavGroup {object} {model} on:select />
  {/each}
</Scroller>

<NavFooter />
