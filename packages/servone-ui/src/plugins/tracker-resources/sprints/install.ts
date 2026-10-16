import setting from '@hcengineering/setting'
import { addLocation, addStringsLoader, loadMetadata, setMetadata, type Metadata } from '@hcengineering/platform'
import { component, icon, iconIds, isScrumProjectFn, servoneTrackerId, specialIds, str } from './plugin'
import { en, vi } from './strings'
import { en as helpdeskEn, helpdeskId, vi as helpdeskVi } from '../helpdesk/strings'

interface Special {
  id: string
  label: string
  icon?: string
  component: string
  [key: string]: unknown
}
interface NavSpace {
  id: string
  specials?: Special[]
  [key: string]: unknown
}
interface NavModel {
  spaces: NavSpace[]
  specials?: Special[]
}

const NAV_EXTENDER = 'servone:metadata:NavModelExtender' as Metadata<(app: { alias: string }, model: NavModel | undefined) => NavModel | undefined>

/** Tracker specials of the model folded into our tabbed entries (their ids in models/tracker). */
const MILESTONES = 'milestones'
const COMPONENTS = 'components'
const TEMPLATES = 'templates'

function asTab (s: Special | undefined, id: string, label?: string): Record<string, unknown> | undefined {
  if (s === undefined) return undefined
  return { id, label: label ?? s.label, component: s.component, componentProps: s.componentProps ?? {} }
}

function projectSpecials (model: Special[]): Special[] {
  const byId = new Map(model.map((s) => [s.id, s]))
  const scrum = { visibleIf: isScrumProjectFn }
  const tabbed = (tabs: Array<Record<string, unknown> | undefined>): Record<string, unknown> => ({
    tabs: tabs.filter((t) => t !== undefined)
  })
  const sprint: Special = {
    id: specialIds.sprint,
    label: str.Sprint,
    icon: icon.sprint,
    component: component.Tabbed,
    componentProps: tabbed([
      { id: 'board', label: str.Board, component: component.ActiveSprint },
      { id: 'planning', label: str.Planning, component: component.Backlog },
      { id: 'triage', label: str.Triage, component: component.Triage },
      asTab(byId.get(MILESTONES), 'history', str.History)
    ]),
    ...scrum
  }
  const more: Special = {
    id: specialIds.more,
    label: str.More,
    icon: byId.get(TEMPLATES)?.icon,
    component: component.Tabbed,
    componentProps: tabbed([
      asTab(byId.get(TEMPLATES), 'templates'),
      { id: 'webhooks', label: str.Webhooks, component: component.ProjectWebhooks }
    ])
  }
  const folded = new Set([MILESTONES, COMPONENTS, TEMPLATES])
  const rest = model.filter((s) => !folded.has(s.id) && s.id !== sprint.id && s.id !== more.id && !ours.has(s.id))
  return [
    ...rest.filter((s) => s.id === 'issues'),
    { id: specialIds.timeline, label: str.Timeline, icon: icon.timeline, component: component.Timeline, ...scrum },
    sprint,
    { id: specialIds.epics, label: str.Epics, icon: icon.epics, component: component.Epics, ...scrum },
    { id: specialIds.releases, label: str.Releases, icon: icon.release, component: component.Releases, ...scrum },
    { id: specialIds.reports, label: str.Reports, icon: icon.report, component: component.SprintReport, ...scrum },
    { id: specialIds.forms, label: str.Forms, icon: icon.form, component: component.Forms },
    ...rest.filter((s) => s.id !== 'issues'),
    more,
    {
      id: specialIds.settings,
      label: str.Settings,
      icon: setting.icon.Setting,
      component: component.Tabbed,
      componentProps: tabbed([
        { id: 'statuses', label: str.Statuses, component: component.ProjectStatuses },
        { id: 'members', label: str.Members, component: component.ProjectMembers },
        { id: 'create-form', label: str.CreateForm, component: component.ProjectCreateForm }
      ])
    }
  ]
}

/** Our ids, so a model that already went through here (or lists them) isn't doubled. */
const ours = new Set(Object.values(specialIds))

function extendTracker (app: { alias: string }, model: NavModel | undefined): NavModel | undefined {
  if (app.alias !== 'tracker' || model === undefined) return model
  return {
    ...model,
    spaces: model.spaces.map((sp) => (sp.id === 'projects' ? { ...sp, specials: projectSpecials(sp.specials ?? []) } : sp))
  }
}

export function installSprintScreens (): void {
  addLocation(servoneTrackerId, async () => await import(/* webpackChunkName: "servone-tracker" */ './resources'))
  addStringsLoader(servoneTrackerId, async (lang: string) => ({ string: { ...en, ...(lang === 'vi' ? vi : {}) } }) as any)
  addStringsLoader(helpdeskId, async (lang: string) => ({ string: lang === 'vi' ? helpdeskVi : helpdeskEn }))
  const sprite = require('./assets/icons.svg') as string // eslint-disable-line
  loadMetadata(icon, Object.fromEntries(iconIds.map((k) => [k, `${sprite}#${k}`])) as any)
  setMetadata(NAV_EXTENDER, extendTracker)
}

installSprintScreens()
