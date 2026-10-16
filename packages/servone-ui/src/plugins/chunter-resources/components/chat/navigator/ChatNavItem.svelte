<script lang="ts">
  import notification, { type DocNotifyContext, type InboxNotification } from '@hcengineering/notification'
  import { getEmbeddedLabel, getResource } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { type Action, IconAdd, IconCheck, IconClose, IconEdit, IconFolderCollapsed, Menu } from '@hcengineering/ui'
  import { getActions, getObjectLinkId } from '@hcengineering/view-resources'
  import {
    getNotificationsCount,
    InboxNotificationsClientImpl,
    isActivityNotification,
    isMentionNotification
  } from '@hcengineering/notification-resources'
  import { createEventDispatcher } from 'svelte'
  import view from '@hcengineering/view'
  import type { Doc } from '@hcengineering/core'
  import { BellOff } from '@lucide/svelte'
  import NavItem from './NavItem.svelte'
  import type { ChatNavItemModel } from '../types'
  import { openChannel } from '../../../navigation'
  import chunter from '../../../plugin'
  import { parseNotifyLevel } from '../../../../../lib/notify/level'
  import { levelActions, levelTarget, muteAction, notifyString } from '../../NotifyLevelButton.svelte'
  import { liveSectionId } from '../../../../../lib/chat/sections'
  import { CONTEXT_DRAG_TYPE, sectionString, sectionsContext } from '../../../sections/store'
  import { askSectionName, createSection, moveToSection, removeFromSection } from '../../../sections/actions'

  export let context: DocNotifyContext | undefined
  export let item: ChatNavItemModel
  export let isSelected: boolean = false
  export let type: 'type-link' | 'type-tag' | 'type-anchor-link' | 'type-object' = 'type-link'

  const dispatch = createEventDispatcher()
  const client = getClient()
  const inboxClient = InboxNotificationsClientImpl.getClient()
  const notificationsByContext = inboxClient.inboxNotificationsByContext
  const liveSections = sectionsContext()
  const linkProviders = client.getModel().findAllSync(view.mixin.LinkIdProvider, {})
  const HIDDEN_MODEL_ACTIONS: string[] = [
    notification.action.ArchiveContextNotifications,
    notification.action.UnReadNotifyContext,
    notification.action.ReadNotifyContext
  ]

  let relevantNotifications: InboxNotification[] = []
  let unreadCount: number | null = null
  let rowActions: Action[] = []

  $: if (context !== undefined) {
    const contextNotifications = $notificationsByContext.get(context._id) ?? []
    relevantNotifications = contextNotifications.filter(
      (entry) =>
        isActivityNotification(entry) ||
        (isMentionNotification(entry) &&
          client.getHierarchy().isDerived(entry.mentionedInClass, chunter.class.ChatMessage))
    )
  }

  $: void refreshUnreadCount(context, relevantNotifications)

  async function refreshUnreadCount (
    currentContext: DocNotifyContext | undefined,
    notifications: InboxNotification[]
  ): Promise<void> {
    const total = await getNotificationsCount(currentContext, notifications)
    unreadCount = total === 0 ? null : total
  }

  $: isMuted = parseNotifyLevel(context) === 'nothing'
  $: hasUnreadDot = context !== undefined && !isMuted && (context.lastViewedTimestamp ?? 0) < (context.lastUpdateTimestamp ?? 0)
  $: hasUnread = !isMuted && (unreadCount !== null || hasUnreadDot)
  $: conversationKind = levelTarget(client, item.object)
  $: isDraggable = context !== undefined && conversationKind !== undefined

  $: void rebuildRowActions(context, item.object, $liveSections)

  async function openConversation (object: Doc): Promise<void> {
    const linkId = await getObjectLinkId(linkProviders, object._id, object._class, object)
    openChannel(linkId, object._class, undefined, true)
  }

  function buildSectionSubmenu (currentContext: DocNotifyContext, sections: typeof $liveSections): Action[] {
    const filedIn = liveSectionId(currentContext, new Set(sections.map((section) => section._id)))
    const sectionEntries: Action[] = sections.map((section) => ({
      label: getEmbeddedLabel(section.name),
      icon: section._id === filedIn ? IconCheck : undefined,
      action: async () => {
        if (section._id !== filedIn) await moveToSection(client, currentContext, section._id)
      }
    }))
    const newSectionEntry: Action = {
      label: sectionString.NewSectionEllipsis,
      icon: IconAdd,
      action: async () => {
        const name = await askSectionName(sectionString.NewSection)
        if (name === undefined) return
        const createdId = await createSection(client, name, sections)
        await moveToSection(client, currentContext, createdId)
      }
    }
    const removeEntries: Action[] =
      filedIn === undefined
        ? []
        : [
            {
              label: sectionString.RemoveFromSection,
              icon: IconClose,
              action: async () => {
                await removeFromSection(client, currentContext)
              }
            }
          ]
    return [...sectionEntries, newSectionEntry, ...removeEntries]
  }

  async function buildModelActions (currentContext: DocNotifyContext, object: Doc): Promise<Action[]> {
    const modelActions = await getActions(client, currentContext, notification.class.DocNotifyContext)
    const builtActions: Action[] = []
    for (const modelAction of modelActions) {
      if (HIDDEN_MODEL_ACTIONS.includes(modelAction._id)) continue
      if (modelAction.visibilityTester !== undefined) {
        const isVisible = await getResource(modelAction.visibilityTester)
        if (!(await isVisible(currentContext))) continue
      }
      builtActions.push({
        icon: modelAction.icon ?? IconEdit,
        label: modelAction.label,
        group: modelAction.context.group,
        action: async (_props, event) => {
          const run = await getResource(modelAction.action)
          await run(currentContext, event, { ...modelAction.actionProps, object })
        }
      })
    }
    return builtActions
  }

  async function rebuildRowActions (
    currentContext: DocNotifyContext | undefined,
    object: Doc,
    sections: typeof $liveSections
  ): Promise<void> {
    if (currentContext === undefined) {
      rowActions = []
      return
    }
    const openEntry: Action = {
      icon: view.icon.Open,
      label: view.string.Open,
      group: 'edit',
      action: async () => {
        await openConversation(object)
      }
    }
    const kind = levelTarget(client, object)
    const mutedNow = parseNotifyLevel(currentContext) === 'nothing'
    const notifyEntries: Action[] = []
    if (kind === 'direct') {
      notifyEntries.push({ ...muteAction(client, currentContext), group: 'servone-notify' })
    } else if (kind === 'channel') {
      notifyEntries.push({
        label: notifyString.Title,
        icon: mutedNow ? notification.icon.BellCrossed : notification.icon.Notifications,
        group: 'servone-notify',
        component: Menu,
        props: { actions: levelActions(client, currentContext) },
        action: async () => {}
      })
    }
    const sectionEntries: Action[] =
      kind === undefined
        ? []
        : [
            {
              label: sectionString.MoveToSection,
              icon: IconFolderCollapsed,
              group: 'servone-section',
              component: Menu,
              props: { actions: buildSectionSubmenu(currentContext, sections) },
              action: async () => {}
            }
          ]
    const modelEntries = await buildModelActions(currentContext, object)
    rowActions = [openEntry, ...notifyEntries, ...sectionEntries, ...modelEntries]
  }

  function handleDragStart (event: DragEvent): void {
    if (context === undefined || event.dataTransfer === null) return
    event.dataTransfer.setData(CONTEXT_DRAG_TYPE, context._id)
    event.dataTransfer.effectAllowed = 'move'
  }
</script>

<div
  role="listitem"
  data-chat-nav-row
  data-unread={hasUnread ? 'true' : 'false'}
  draggable={isDraggable}
  class="group/muted relative"
  class:opacity-60={isMuted}
  on:dragstart={handleDragStart}
>
  <NavItem
    _id={item.id}
    icon={item.icon}
    withIconBackground={item.withIconBackground}
    iconSize={item.iconSize}
    {isSelected}
    iconProps={{ ...item.iconProps, value: item.object }}
    count={unreadCount}
    title={item.title}
    description={item.description}
    secondaryNotifyMarker={hasUnreadDot}
    actions={rowActions}
    {type}
    on:click={() => {
      dispatch('select', { object: item.object })
    }}
  />
  {#if isMuted}
    <BellOff
      class="pointer-events-none absolute right-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground group-hover/muted:hidden"
      aria-hidden="true"
    />
  {/if}
</div>
