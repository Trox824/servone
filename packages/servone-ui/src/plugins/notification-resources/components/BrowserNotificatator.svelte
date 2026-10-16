<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import core, { AccountRole, getCurrentAccount, type Class, type Doc, type Ref } from '@hcengineering/core'
  import notification, { type BrowserNotification, type InboxNotification } from '@hcengineering/notification'
  import { getResource } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { addNotification, getCurrentResolvedLocation, NotificationSeverity, type Location } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { parseLinkId } from '@hcengineering/view-resources'
  import workbench, { type Application } from '@hcengineering/workbench'
  import { shouldAlert } from '@servone/notify-rules'
  import { get } from 'svelte/store'
  import { pausedUntilStore, startPauseReconciler } from '../../../lib/notify/pause'
  import { workingScheduleStore } from '../../../lib/notify/push-setting'
  import { InboxNotificationsClientImpl } from '../inboxNotificationsClient'
  import { checkPermission, pushAllowed, subscribePush } from '../utils'
  import Notification from './Notification.svelte'

  const APP_ALIAS_SEGMENT = 2
  const LINK_ID_SEGMENT = 1
  const CLASS_ID_SEGMENT = 2

  startPauseReconciler()

  const modelClient = getClient()
  const currentAccount = getCurrentAccount()
  const linkIdProviders = modelClient.getModel().findAllSync(view.mixin.LinkIdProvider, {})
  const pendingQuery = createQuery()

  async function removeDocument (pending: BrowserNotification): Promise<void> {
    if (currentAccount.role === AccountRole.ReadOnlyGuest) return
    await modelClient.remove(pending)
  }

  async function isSilenced (pending: BrowserNotification): Promise<boolean> {
    if (pending.senderId === core.account.System) return true

    const inboxId = pending.tag as Ref<InboxNotification>
    const inboxItem = await modelClient.findOne(notification.class.InboxNotification, { _id: inboxId })
    if (inboxItem === undefined) return false

    const contexts = get(InboxNotificationsClientImpl.getClient().contextById)
    const notifyContext = contexts.get(inboxItem.docNotifyContext)

    return !shouldAlert(inboxItem, notifyContext, {
      now: Date.now(),
      pausedUntil: get(pausedUntilStore),
      schedule: get(workingScheduleStore)
    })
  }

  async function findMainViewObjectId (location: Location): Promise<Ref<Doc> | undefined> {
    const appAlias = location.path[APP_ALIAS_SEGMENT]
    const [application] = modelClient
      .getModel()
      .findAllSync<Application>(workbench.class.Application, { alias: appAlias })

    if (application?.locationDataResolver !== undefined) {
      const resolveLocationData = await getResource(application.locationDataResolver)
      const resolved = await resolveLocationData(location)
      return resolved.objectId
    }

    if (location.fragment === undefined || location.fragment === '') return undefined
    const pieces = decodeURIComponent(location.fragment).split('|')
    const linkId = pieces[LINK_ID_SEGMENT]
    const classId = pieces[CLASS_ID_SEGMENT]
    if (classId === undefined) return undefined

    try {
      return await parseLinkId(linkIdProviders, linkId, classId as Ref<Class<Doc>>)
    } catch (err) {
      Analytics.handleError(err)
      return undefined
    }
  }

  async function isAlreadyViewed (pending: BrowserNotification): Promise<boolean> {
    if (!pending.objectId) return false

    const getSidebarObject = await getResource(workbench.function.GetSidebarObject)
    if (pending.objectId === getSidebarObject()._id) return true

    const mainViewObjectId = await findMainViewObjectId(getCurrentResolvedLocation())
    return pending.objectId === mainViewObjectId
  }

  async function handlePending (pending: BrowserNotification): Promise<void> {
    if (await isSilenced(pending)) {
      await removeDocument(pending)
      return
    }
    if (await isAlreadyViewed(pending)) {
      await removeDocument(pending)
      return
    }
    addNotification(
      pending.title,
      pending.body,
      Notification,
      { value: pending },
      NotificationSeverity.Info,
      'notification-' + pending.objectId
    )
    await removeDocument(pending)
  }

  async function applyPushGate (isPushAllowed: boolean): Promise<void> {
    if (isPushAllowed || (await checkPermission(true)) || (await subscribePush())) {
      pendingQuery.unsubscribe()
      return
    }
    pendingQuery.query(notification.class.BrowserNotification, { user: currentAccount.uuid }, (pendingList) => {
      if (pendingList.length > 0) void handlePending(pendingList[0])
    })
  }

  $: void applyPushGate($pushAllowed)
</script>
