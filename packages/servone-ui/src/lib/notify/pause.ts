import core, { getCurrentAccount, type AccountUuid, type Class, type Doc, type Ref, type Timestamp } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import { createQuery, getClient, onClient } from '@hcengineering/presentation'
import { readPause, type StoredPause } from '@servone/notify-rules'
import { get, readable, readonly, writable } from 'svelte/store'
import { isPushOn } from './pause-time'
import { myPushSettingsStore, pushDefault, setPush, startPushSettingQuery, isPushSettingLoadedStore } from './push-setting'

export { formatPauseTime, parseLocalDateTime, toLocalDateTime } from './pause-time'
export { readPause } from '@servone/notify-rules'

interface MemberStatus extends Doc, StoredPause {
  user: AccountUuid
  servonePausedUntil?: Timestamp
  servonePushWasEnabled?: unknown
}

const MEMBER_STATUS = 'contact:class:WorkspaceMemberStatus' as Ref<Class<MemberStatus>>
const MAX_TIMER_MS = 2_147_483_647
const MINUTE = 60_000

export const pauseString = {
  PauseNotifications: 'contact:string:ServonePauseNotifications' as IntlString,
  PauseFor30m: 'contact:string:ServonePauseFor30m' as IntlString,
  PauseFor1h: 'contact:string:ServonePauseFor1h' as IntlString,
  PauseFor2h: 'contact:string:ServonePauseFor2h' as IntlString,
  PauseUntilTomorrow: 'contact:string:ServonePauseUntilTomorrow' as IntlString,
  PauseCustom: 'contact:string:ServonePauseCustom' as IntlString,
  ResumeNotifications: 'contact:string:ServoneResumeNotifications' as IntlString,
  PausedUntil: 'contact:string:ServonePausedUntil' as IntlString,
  NotificationsPausedUntil: 'contact:string:ServoneNotificationsPausedUntil' as IntlString
}

const pausedUntil = writable<Timestamp | undefined>(undefined)
export const pausedUntilStore = readonly(pausedUntil)

export const minuteClock = readable(Date.now(), (set) => {
  set(Date.now())
  const id = setInterval(() => {
    set(Date.now())
  }, MINUTE)
  return () => {
    clearInterval(id)
  }
})

async function findMyStatus (): Promise<MemberStatus | undefined> {
  return await getClient().findOne(MEMBER_STATUS, { user: getCurrentAccount().uuid })
}

async function clearPause (status: MemberStatus): Promise<void> {
  if (status.message.trim() === '') {
    await getClient().remove(status)
  } else {
    await getClient().update(status, { $unset: { servonePausedUntil: true, servonePushWasEnabled: true } })
  }
}

export async function pause (until: Timestamp): Promise<void> {
  const client = getClient()
  const status = await findMyStatus()
  if (status === undefined) {
    await client.createDoc(MEMBER_STATUS, core.space.Workspace, {
      user: getCurrentAccount().uuid,
      message: '',
      servonePausedUntil: until
    })
  } else {
    await client.update(status, { servonePausedUntil: until })
  }
}

export async function resume (): Promise<void> {
  const status = await findMyStatus()
  if (status === undefined || readPause(status) === undefined) return
  await clearPause(status)
}

let myStatus: MemberStatus | undefined
let isStatusLoaded = false
let timer: ReturnType<typeof setTimeout> | undefined

function scheduleExpiry (): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  const current = readPause(myStatus)
  if (current === undefined) return
  const now = Date.now()
  if (now >= current.until) {
    void resume()
    return
  }
  timer = setTimeout(scheduleExpiry, Math.min(current.until - now, MAX_TIMER_MS))
}

let isLegacyChecked = false

async function restoreLegacyPush (): Promise<void> {
  if (isLegacyChecked || !isStatusLoaded || !get(isPushSettingLoadedStore)) return
  isLegacyChecked = true
  const status = myStatus
  if (status === undefined || status.servonePushWasEnabled === undefined) return
  const account = getCurrentAccount()
  const wasEnabled = status.servonePushWasEnabled !== false
  if (wasEnabled && !isPushOn(get(myPushSettingsStore), pushDefault())) await setPush(account, true)
  const pause = readPause(status)
  if (pause !== undefined && Date.now() >= pause.until) return
  await getClient().update(status, { $unset: { servonePushWasEnabled: true } })
}

let isStarted = false

export function startPauseReconciler (): void {
  if (isStarted) return
  isStarted = true
  startPushSettingQuery()
  const statusQuery = createQuery(true)
  onClient((_client, account) => {
    statusQuery.query(MEMBER_STATUS, { user: account.uuid }, (statuses) => {
      myStatus = statuses[0]
      isStatusLoaded = true
      pausedUntil.set(readPause(myStatus)?.until)
      scheduleExpiry()
      void restoreLegacyPush()
    })
  })
  isPushSettingLoadedStore.subscribe(() => {
    void restoreLegacyPush()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleExpiry()
  })
}
