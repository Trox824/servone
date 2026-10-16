import core, { getCurrentAccount, type Account, type Class, type Ref } from '@hcengineering/core'
import notification, { type NotificationProvider, type NotificationProviderSetting } from '@hcengineering/notification'
import { createQuery, getClient, onClient } from '@hcengineering/presentation'
import { parseSchedule, type DigestSettings, type StoredSchedule } from '@servone/notify-rules'
import { derived, readonly, writable } from 'svelte/store'

export interface ServonePushSetting extends NotificationProviderSetting {
  servoneSchedule?: StoredSchedule
  servoneDigest?: DigestSettings
}

export type ServonePushFields = Pick<ServonePushSetting, 'servoneSchedule' | 'servoneDigest'>

const PUSH = notification.providers.PushNotificationProvider
const SERVONE_PUSH_SETTING = notification.class.NotificationProviderSetting as Ref<Class<ServonePushSetting>>
const EMAIL = 'gmail:providers:EmailNotificationProvider' as Ref<NotificationProvider>

const mySettings = writable<NotificationProviderSetting[]>([])
const isLoaded = writable(false)

export const myPushSettingsStore = readonly(mySettings)
export const isPushSettingLoadedStore = readonly(isLoaded)
export const myPushSettingStore = derived(mySettings, (settings) => settings[0])
export const workingScheduleStore = derived(mySettings, (settings) => parseSchedule(settings[0]))

let isStarted = false

export function startPushSettingQuery (): void {
  if (isStarted) return
  isStarted = true
  const query = createQuery(true)
  onClient((_client, account) => {
    query.query(
      notification.class.NotificationProviderSetting,
      { attachedTo: PUSH, createdBy: { $in: account.socialIds } },
      (settings) => {
        mySettings.set(settings)
        isLoaded.set(true)
      }
    )
  })
}

export function pushDefault (): boolean {
  const provider = getClient().getModel().findAllSync(notification.class.NotificationProvider, { _id: PUSH })[0]
  return provider?.defaultEnabled ?? true
}

export async function findMyPushSettings (account: Account): Promise<NotificationProviderSetting[]> {
  return await getClient().findAll(notification.class.NotificationProviderSetting, {
    attachedTo: PUSH,
    createdBy: { $in: account.socialIds }
  })
}

export async function setPush (account: Account, enabled: boolean): Promise<void> {
  const client = getClient()
  const settings = await findMyPushSettings(account)
  if (settings.length === 0) {
    await client.createDoc(notification.class.NotificationProviderSetting, core.space.Workspace, {
      attachedTo: PUSH,
      enabled
    })
    return
  }
  for (const setting of settings) {
    if (setting.enabled !== enabled) await client.update(setting, { enabled })
  }
}

export async function updateMyPushSetting (fields: ServonePushFields): Promise<void> {
  const client = getClient()
  const setting: ServonePushSetting | undefined = (await findMyPushSettings(getCurrentAccount()))[0]
  if (setting === undefined) {
    await client.createDoc(SERVONE_PUSH_SETTING, core.space.Workspace, { attachedTo: PUSH, enabled: pushDefault(), ...fields })
    return
  }
  await client.update(setting, fields)
}

export async function setMentionEmails (enabled: boolean): Promise<void> {
  const client = getClient()
  const account = getCurrentAccount()
  const type = notification.ids.MentionNotificationType
  const existing = await client.findAll(notification.class.NotificationTypeSetting, {
    attachedTo: EMAIL,
    type,
    createdBy: { $in: account.socialIds }
  })
  if (existing.length === 0) {
    await client.createDoc(notification.class.NotificationTypeSetting, core.space.Workspace, {
      attachedTo: EMAIL,
      type,
      enabled
    })
    return
  }
  for (const setting of existing) {
    if (setting.enabled !== enabled) await client.update(setting, { enabled })
  }
}
