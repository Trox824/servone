import core, { AccountRole, getCurrentAccount, type Class, type Ref, type TxOperations } from '@hcengineering/core'
import { getMetadata, type IntlString } from '@hcengineering/platform'
import preference, { type Preference } from '@hcengineering/preference'
import { createQuery } from '@hcengineering/presentation'
import workbench, { type Application, type HiddenApplication } from '@hcengineering/workbench'
import { writable, type Readable } from 'svelte/store'
import { APP_ORDER_ATTACHED_TO, UNSHIPPED_APP_ALIASES, parseAppOrder } from '../../lib/app-rail'
import { focusAppOrder } from '../../onboarding/checklist/app-order'
import { TEAM_FOCUS_SPACE, parseTeamFocus, teamFocusClass, type TeamFocus } from '../../onboarding/team-focus'

export const railString = {
  MoveUp: 'workbench:string:ServoneMoveUp' as IntlString,
  MoveDown: 'workbench:string:ServoneMoveDown' as IntlString,
  HideFromSidebar: 'workbench:string:ServoneHideFromSidebar' as IntlString,
  ResetSidebar: 'workbench:string:ServoneResetSidebar' as IntlString,
  MoreApps: 'workbench:string:ServoneMoreApps' as IntlString,
  PinToBar: 'workbench:string:ServonePinToBar' as IntlString,
  UnpinFromBar: 'workbench:string:ServoneUnpinFromBar' as IntlString
}

const PHONE_BAR_KEY = 'servone-phone-bar'
const DEFAULT_PHONE_BAR = ['chunter', 'tracker', 'time']
export const MAX_PHONE_BAR_APPS = 4 // 390px fits four labelled slots plus More

function readPhoneBar (): string[] {
  const stored = localStorage.getItem(PHONE_BAR_KEY)
  if (stored === null) return DEFAULT_PHONE_BAR
  const parsed: unknown = JSON.parse(stored)
  return Array.isArray(parsed) && parsed.every((alias) => typeof alias === 'string') ? parsed : DEFAULT_PHONE_BAR
}

export const phoneBarAliases = writable(readPhoneBar())
phoneBarAliases.subscribe((aliases) => {
  localStorage.setItem(PHONE_BAR_KEY, JSON.stringify(aliases))
})

export function togglePhoneBarApp (alias: string): void {
  phoneBarAliases.update((aliases) => {
    if (aliases.includes(alias)) return aliases.filter((it) => it !== alias)
    return aliases.length >= MAX_PHONE_BAR_APPS ? aliases : [...aliases, alias]
  })
}

interface AppOrderPreference extends Preference {
  servoneAppOrder: string[]
}

const orderClass = preference.class.Preference as Ref<Class<AppOrderPreference>>

export interface AppRail {
  order: string[]
  orderDoc: Ref<AppOrderPreference> | undefined
  hidden: HiddenApplication[]
  disabled: Set<string>
  isLoaded: boolean
}

export function watchAppRail (): Readable<AppRail> {
  let rail: AppRail = { order: [], orderDoc: undefined, hidden: [], disabled: new Set(), isLoaded: false }
  let isOrderLoaded = false
  let isHiddenLoaded = false
  let isDisabledLoaded = false
  let isFocusLoaded = false
  let isAppsLoaded = false
  let savedOrder: string[] = []
  let teamFocus: TeamFocus = 'both'
  let apps: Application[] = []
  const store = writable(rail)
  function publish (next: Partial<AppRail>): void {
    const order = savedOrder.length > 0 ? savedOrder : focusAppOrder(apps, teamFocus)
    const isLoaded = isOrderLoaded && isHiddenLoaded && isDisabledLoaded && isFocusLoaded && isAppsLoaded
    rail = { ...rail, ...next, order, isLoaded }
    store.set(rail)
  }
  createQuery().query(orderClass, { attachedTo: APP_ORDER_ATTACHED_TO }, (docs) => {
    isOrderLoaded = true
    const doc = docs[0]
    savedOrder = doc === undefined ? [] : parseAppOrder(doc)
    publish({ orderDoc: doc?._id })
  })
  createQuery().query(teamFocusClass, { space: TEAM_FOCUS_SPACE }, (settings) => {
    isFocusLoaded = true
    teamFocus = parseTeamFocus(settings.find((it) => it.servoneTeamFocus !== undefined)?.servoneTeamFocus)
    publish({})
  })
  createQuery().query(workbench.class.Application, {}, (found) => {
    isAppsLoaded = true
    apps = found
    publish({})
  })
  createQuery().query(workbench.class.HiddenApplication, { space: core.space.Workspace }, (docs) => {
    isHiddenLoaded = true
    publish({ hidden: docs })
  })
  const role = getCurrentAccount().role
  createQuery().query(core.class.ModulePermissionGroup, {}, (groups) => {
    isDisabledLoaded = true
    const disabled = groups.filter(
      (g) => !(g.enabled ?? true) && (role === g.role || (role === AccountRole.DocGuest && g.role === AccountRole.Guest))
    )
    publish({ disabled: new Set(disabled.map((g) => g.application)) })
  })
  return store
}

export function unavailableApps (apps: Application[], rail: AppRail): Set<string> {
  const role = getCurrentAccount().role
  const isAnonymous = role === AccountRole.ReadOnlyGuest || role === AccountRole.Guest
  const excluded = isAnonymous ? getMetadata(workbench.metadata.ExcludedApplicationsForAnonymous) ?? [] : []
  const dropped = apps.filter((app) => excluded.includes(app.alias) || UNSHIPPED_APP_ALIASES.includes(app.alias))
  return new Set([...rail.disabled, ...dropped.map((app) => app._id)])
}

export async function saveAppOrder (client: TxOperations, rail: AppRail, order: string[]): Promise<void> {
  if (rail.orderDoc === undefined) {
    await client.createDoc(orderClass, core.space.Workspace, {
      attachedTo: APP_ORDER_ATTACHED_TO,
      servoneAppOrder: order
    })
    return
  }
  await client.updateDoc(orderClass, core.space.Workspace, rail.orderDoc, { servoneAppOrder: order })
}

export async function showApp (client: TxOperations, rail: AppRail, app: Ref<Application>): Promise<void> {
  const ops = client.apply(undefined, 'servone-show-app')
  for (const doc of rail.hidden) {
    if (doc.attachedTo === app) await ops.remove(doc)
  }
  await ops.commit()
}

export async function resetAppRail (client: TxOperations, rail: AppRail): Promise<void> {
  const ops = client.apply(undefined, 'servone-reset-app-rail')
  for (const doc of rail.hidden) await ops.remove(doc)
  if (rail.orderDoc !== undefined) await ops.removeDoc(orderClass, core.space.Workspace, rail.orderDoc)
  await ops.commit()
}
