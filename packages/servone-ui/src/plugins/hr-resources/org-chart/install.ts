import { addLocation, addStringsLoader, getMetadata, setMetadata, type Metadata } from '@hcengineering/platform'
import { getCurrentLocation, location, navigate } from '@hcengineering/ui'
import { component, servonePeopleId, str } from './plugin'
import { en, vi } from './strings'

interface Special {
  id: string
  label: string
  icon?: string
  component: string
}
interface NavModel {
  specials?: Special[]
}
type NavModelExtender = (app: { alias: string }, model: NavModel | undefined) => NavModel | undefined

const NAV_EXTENDER = 'servone:metadata:NavModelExtender' as Metadata<NavModelExtender>
const CONTACTS_APP = 'contact'
const ORG_CHART = 'org-chart'
const EMPLOYEES = 'employees'
const HIDDEN_PAGES = ['guests', 'persons', 'companies']
const STRUCTURE_ICON = 'hr:icon:Structure'
const EMPLOYEES_LABEL = 'contact:string:Employees'

function extendContacts (app: { alias: string }, model: NavModel | undefined): NavModel | undefined {
  if (app.alias !== CONTACTS_APP || model === undefined) return model
  const specials = (model.specials ?? [])
    .filter((special) => special.id !== ORG_CHART && !HIDDEN_PAGES.includes(special.id))
    .map((special) => (special.id === EMPLOYEES ? { ...special, label: EMPLOYEES_LABEL, component: component.Directory } : special))
  const orgChart = { id: ORG_CHART, label: str.OrgChart, icon: STRUCTURE_ICON, component: component.OrgChart }
  const afterEmployees = specials.findIndex((special) => special.id === EMPLOYEES) + 1
  return { ...model, specials: [...specials.slice(0, afterEmployees), orgChart, ...specials.slice(afterEmployees)] }
}

export function installOrgChart (): void {
  addLocation(servonePeopleId, async () => await import(/* webpackChunkName: "servone-people" */ './resources'))
  addStringsLoader(servonePeopleId, async (lang: string) => ({ string: lang === 'vi' ? { ...en, ...vi } : en }))
  const previous = getMetadata(NAV_EXTENDER)
  setMetadata(NAV_EXTENDER, (app, model) => extendContacts(app, previous?.(app, model) ?? model))
  location.subscribe((loc) => {
    if (loc.path[2] !== CONTACTS_APP || !HIDDEN_PAGES.includes(loc.path[3])) return
    const next = getCurrentLocation()
    next.path[3] = EMPLOYEES
    next.path.length = 4
    navigate(next, true)
  })
}

installOrgChart()
