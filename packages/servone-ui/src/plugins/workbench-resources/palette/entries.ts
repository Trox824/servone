import communication from '@hcengineering/communication'
import contact from '@hcengineering/contact'
import core, { AccountRole, generateId, getCurrentAccount, hasAccountRole, type Class, type Doc, type Ref, type Space } from '@hcengineering/core'
import notification from '@hcengineering/notification'
import { getMetadata, getResource, translate, type Asset, type IntlString } from '@hcengineering/platform'
import { getClient, isAdminUser, isDisabled } from '@hcengineering/presentation'
import setting, { RoleCapability } from '@hcengineering/setting'
import tracker from '@hcengineering/tracker'
import { closePanel, getCurrentLocation, navigate, showPopup, type AnyComponent } from '@hcengineering/ui'
import view, { encodeObjectURI } from '@hcengineering/view'
import { openDoc } from '@hcengineering/view-resources'
import workbench, { type Application, type NavigatorModel, type SpecialNavModel } from '@hcengineering/workbench'
import { MAIL_ACCOUNT_CLASS, mailboxSpaceId } from '@servone/mail'
import { arrangeApps } from '../../../lib/app-rail'
import { isLegacyConfigCategory } from '../../setting-resources/legacy-config'
import { isWorkflowType } from '../../tracker-resources/workflows/nav'
import { WORKFLOW_APP_ALIAS } from '../../tracker-resources/workflows/plugin'
import { unavailableApps, type AppRail } from '../rail'
import { buildNavModel, isAllowedToRole } from '../utils'
import { paletteStr } from './strings'

export interface PaletteEntry {
  id: string
  group: IntlString
  text: string
  hint?: string
  aliases?: string[]
  icon?: Asset
  isSearchOnly: boolean
  run: () => void | Promise<void>
}

const PSEUDO_SETTINGS: Array<[string, IntlString]> = [
  ['appearance', 'setting:string:ServoneAppearance' as IntlString],
  ['aiClients', 'setting:string:ServoneAiClients' as IntlString]
]

type SettingsPage = [path: string[], label: IntlString, icon: Asset | undefined, hint: string]

const WORKSPACE_SETTINGS = 'setting'
const CHAT_SETTINGS: Array<[string, IntlString]> = [
  ['servone-chat', 'setting:string:ServoneChat' as IntlString]
]
const CHAT_ICON = 'chunter:icon:Chunter' as Asset

const CHANNEL_CLASS = 'chunter:class:Channel' as Ref<Class<Space>>
const DRIVE_CLASS = 'drive:class:Drive' as Ref<Class<Space>>
const DOCUMENT_CLASS = 'document:class:Document' as Ref<Class<Doc>>

function goTo (path: string[], query?: Record<string, string>): void {
  closePanel()
  const loc = getCurrentLocation()
  navigate({ path: [loc.path[0], loc.path[1], ...path], query })
}

function projectPagesOf (model: NavigatorModel | undefined): SpecialNavModel[] {
  const navs = [...(model?.spaces ?? []).map((nav) => ({ ofClass: nav.spaceClass, specials: nav.specials })), ...(model?.groups ?? []).map((nav) => ({ ofClass: nav.groupByClass, specials: nav.specials }))]
  return navs.find((nav) => nav.ofClass === tracker.class.Project)?.specials ?? []
}

interface PageTab {
  id: string
  label: IntlString
}

function tabsOf (page: SpecialNavModel): PageTab[] {
  const tabs = page.componentProps?.tabs
  return Array.isArray(tabs) ? tabs.filter((tab): tab is PageTab => typeof tab?.id === 'string' && typeof tab?.label === 'string') : []
}

function visibleApps (rail: AppRail): Application[] {
  const account = getCurrentAccount()
  const excluded = getMetadata(workbench.metadata.ExcludedApplications) ?? []
  const apps = getClient()
    .getModel()
    .findAllSync(workbench.class.Application, { hidden: false, _id: { $nin: excluded } })
    .filter((app) => isAllowedToRole(app.accessLevel, account))
  const hiddenIds = new Set<string>(rail.hidden.map((doc) => doc.attachedTo))
  return arrangeApps(apps, rail.order, unavailableApps(apps, rail)).filter((app) => !hiddenIds.has(app._id))
}

async function canInvite (): Promise<boolean> {
  if (!hasAccountRole(getCurrentAccount(), AccountRole.User) || isDisabled('invites')) return false
  const hasCapability = await getResource(setting.function.HasRoleCapability)
  return await hasCapability(RoleCapability.GenerateInviteLink)
}

async function newEmail (lang: string): Promise<void> {
  const account = await getClient().findOne(MAIL_ACCOUNT_CLASS, { space: mailboxSpaceId(getCurrentAccount().uuid) })
  if (account === undefined) {
    goTo(['mail'])
    return
  }
  const { openNewMail } = await import('../../../mail/lib/compose-popup')
  openNewMail(account, lang)
}

async function startMeeting (lang: string): Promise<void> {
  const [{ joinContext }, { textOf }] = await Promise.all([
    import('../../love-resources/calls/join'),
    import('../../love-resources/calls/strings')
  ])
  await joinContext(generateId(), textOf(lang === 'vi' ? 'vi' : 'en')('QuickMeeting'))
}

function newDocument (): void {
  showPopup('document:component:CreateDocument' as AnyComponent, {}, 'top', async (id) => {
    if (id === undefined || id === null) return
    const client = getClient()
    const doc = await client.findOne(DOCUMENT_CLASS, { _id: id })
    if (doc !== undefined) void openDoc(client.getHierarchy(), doc)
  })
}

async function newEvent (meeting: boolean): Promise<void> {
  const [{ default: NewEventDialog }, { mount, unmount }] = await Promise.all([import('./NewEventDialog.svelte'), import('svelte')])
  const dialog = mount(NewEventDialog, {
    target: document.body,
    props: { meeting, onClose: () => { void unmount(dialog) } }
  })
}

async function newWorkflow (): Promise<void> {
  const { default: CreateWorkflowDialog } = await import('../../tracker-resources/workflows/components/CreateWorkflowDialog.svelte')
  showPopup(CreateWorkflowDialog, {}, 'top')
}

export async function buildEntries (rail: AppRail, lang: string): Promise<PaletteEntry[]> {
  const client = getClient()
  const account = getCurrentAccount()
  const apps = visibleApps(rail)
  const appByAlias = new Map(apps.map((app) => [app.alias, app]))
  const text = async (label: IntlString): Promise<string> => await translate(label, {}, lang)
  const entries: PaletteEntry[] = []
  const add = (entry: Omit<PaletteEntry, 'isSearchOnly'>, isSearchOnly = false): void => {
    entries.push({ ...entry, isSearchOnly })
  }

  const goToGroup = paletteStr.GoTo
  const inboxAlias = (getMetadata(communication.metadata.Enabled) ?? false) ? 'inbox' : 'notification'
  add({ id: 'goto:inbox', group: goToGroup, text: await text(paletteStr.Inbox), icon: notification.icon.Notifications, run: () => { goTo([inboxAlias]) } })
  const appNames = new Map<string, string>()
  for (const app of apps) {
    const name = await text(app.label)
    appNames.set(app.alias, name)
    add({ id: `goto:${app.alias}`, group: goToGroup, text: name, aliases: [app.alias], icon: app.icon, run: () => { goTo([app.alias]) } })
  }
  const settingsName = await text(paletteStr.Settings)
  add({ id: 'goto:setting', group: goToGroup, text: settingsName, icon: setting.icon.Setting, run: () => { goTo(['setting']) } })

  const navModels = new Map<string, NavigatorModel | undefined>()
  for (const app of apps) {
    const model = await buildNavModel(client, app)
    navModels.set(app.alias, model)
    for (const special of model?.specials ?? []) {
      if (special.visibleIf !== undefined || !isAllowedToRole(special.accessLevel, account)) continue
      if (special.checkIsDisabled !== undefined && (await (await getResource(special.checkIsDisabled))())) continue
      const path = [app.alias, special.id]
      add({ id: `page:${path.join('/')}`, group: goToGroup, text: await text(special.label), hint: appNames.get(app.alias), icon: special.icon ?? app.icon, run: () => { goTo(path) } }, true)
    }
  }

  const categories = (await client.findAll(setting.class.SettingsCategory, {}, { sort: { order: 1 } })).filter(
    (c) => hasAccountRole(account, c.role) && !isDisabled(c.feature) && c.name !== 'password' && !isLegacyConfigCategory(c.name)
  )
  const settingsPages = categories.map((c): SettingsPage => [[c.name], c.label, c.icon, settingsName])
  for (const [name, label] of PSEUDO_SETTINGS) settingsPages.push([[name], label, undefined, settingsName])
  if (hasAccountRole(account, AccountRole.Maintainer)) settingsPages.push([['import'], 'setting:string:ServoneImport' as IntlString, undefined, settingsName])

  const workspaceSettings = categories.find((c) => c.name === WORKSPACE_SETTINGS)
  if (workspaceSettings !== undefined) {
    const hint = await text(workspaceSettings.label)
    const isAdmin = isAdminUser()
    const subPages = (await client.findAll(setting.class.WorkspaceSettingCategory, {}, { sort: { order: 1 } })).filter(
      (c) => hasAccountRole(account, c.role) && !isDisabled(c.feature ?? '') && (isAdmin || !(c.adminOnly ?? false)) && !isLegacyConfigCategory(c.name)
    )
    for (const c of subPages) settingsPages.push([[WORKSPACE_SETTINGS, c.name], c.label, c.icon, hint])
    if (hasAccountRole(account, AccountRole.Maintainer)) {
      for (const [name, label] of CHAT_SETTINGS) settingsPages.push([[WORKSPACE_SETTINGS, name], label, CHAT_ICON, hint])
    }
  }
  for (const [path, label, icon, hint] of settingsPages) {
    add({ id: `setting:${path.join('/')}`, group: goToGroup, text: await text(label), hint, icon: icon ?? setting.icon.Setting, run: () => { goTo(['setting', ...path]) } }, true)
  }

  const chat = appByAlias.get('chunter')
  const drive = appByAlias.get('drive')
  const spaces = await client.findAll(core.class.Space, { _class: { $in: [CHANNEL_CLASS, DRIVE_CLASS] }, archived: false })
  const channelHint = await text(paletteStr.Channel)
  const driveHint = await text(paletteStr.Drive)
  for (const space of spaces) {
    if (space._class === CHANNEL_CLASS && chat !== undefined) {
      add({ id: `space:${space._id}`, group: goToGroup, text: space.name, hint: channelHint, icon: chat.icon, run: () => { goTo([chat.alias, encodeObjectURI(space._id, space._class)]) } }, true)
    }
    if (space._class === DRIVE_CLASS && drive !== undefined) {
      add({ id: `space:${space._id}`, group: goToGroup, text: space.name, hint: driveHint, icon: drive.icon, run: () => { goTo([drive.alias, space._id]) } }, true)
    }
  }
  const projectHint = await text(paletteStr.Project)
  const workflowHint = await text(paletteStr.Workflow)
  for (const project of await client.findAll(tracker.class.Project, { archived: false })) {
    const isWorkflow = isWorkflowType(project.type)
    const app = appByAlias.get(isWorkflow ? WORKFLOW_APP_ALIAS : 'tracker')
    if (app === undefined) continue
    const path = [app.alias, project._id, isWorkflow ? 'items' : 'issues']
    add({ id: `space:${project._id}`, group: goToGroup, text: project.name, hint: isWorkflow ? workflowHint : projectHint, icon: app.icon, run: () => { goTo(path) } }, true)
    for (const page of projectPagesOf(navModels.get(app.alias))) {
      if (!isAllowedToRole(page.accessLevel, account)) continue
      if (page.visibleIf !== undefined && !(await (await getResource(page.visibleIf))([project]))) continue
      const pagePath = [app.alias, project._id, page.id]
      const pageName = await text(page.label)
      const icon = page.icon ?? app.icon
      add({ id: `page:${pagePath.join('/')}`, group: goToGroup, text: pageName, hint: project.name, icon, run: () => { goTo(pagePath) } }, true)
      for (const tab of tabsOf(page)) {
        const query = { tab: tab.id }
        add({ id: `page:${pagePath.join('/')}?tab=${tab.id}`, group: goToGroup, text: await text(tab.label), hint: `${project.name} · ${pageName}`, icon, run: () => { goTo(pagePath, query) } }, true)
      }
    }
  }

  const creates: Array<[string, IntlString, () => void | Promise<void>]> = [
    ['chunter', paletteStr.NewChannel, () => { showPopup('chunter:component:CreateChannel' as AnyComponent, {}, 'top') }],
    ['chunter', paletteStr.NewDirectMessage, () => { showPopup('chunter:component:CreateDirectChat' as AnyComponent, {}, 'top') }],
    ['mail', paletteStr.NewEmail, async () => { await newEmail(lang) }],
    ['time', paletteStr.NewEvent, async () => { await newEvent(false) }],
    ['time', paletteStr.NewToDo, () => { showPopup('time:component:CreateToDoPopup' as AnyComponent, {}, 'top') }],
    ['love', paletteStr.MeetNow, async () => { await startMeeting(lang) }],
    ['love', paletteStr.NewMeeting, async () => { await newEvent(true) }],
    ['document', paletteStr.NewDocument, newDocument]
  ]
  if (hasAccountRole(account, AccountRole.User)) creates.push([WORKFLOW_APP_ALIAS, paletteStr.NewWorkflow, newWorkflow])
  for (const [alias, label, run] of creates) {
    const app = appByAlias.get(alias)
    if (app !== undefined) add({ id: `create:${label}`, group: paletteStr.Create, text: await text(label), icon: app.icon, run })
  }
  if (await canInvite()) {
    add({ id: 'create:invite', group: paletteStr.Create, text: await text(paletteStr.InviteTeammate), icon: contact.icon.Person, run: () => { showPopup('login:component:InviteLink' as AnyComponent, {}) } })
  }

  const inboxActions = await import('../../inbox-resources/inbox-actions')
  add({ id: 'inbox:read', group: paletteStr.Inbox, text: await text(paletteStr.MarkAllRead), icon: view.icon.Eye, run: inboxActions.readAllInbox })
  add({ id: 'inbox:clear', group: paletteStr.Inbox, text: await text(paletteStr.ClearInbox), icon: view.icon.CheckCircle, run: async () => { await inboxActions.confirmClearInbox(inboxActions.clearAllInbox) } })
  return entries
}
