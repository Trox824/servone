import type { IntlString, Plugin } from '@hcengineering/platform'
import type { AnyComponent } from '@hcengineering/ui'
import { en, type StringKey } from './strings'

export const servonePeopleId = 'servone-people' as Plugin

export const str = Object.fromEntries(
  Object.keys(en).map((k) => [k, `${servonePeopleId}:string:${k}` as IntlString])
) as Record<StringKey, IntlString>

export const component = {
  OrgChart: `${servonePeopleId}:component:OrgChart` as AnyComponent,
  Directory: `${servonePeopleId}:component:Directory` as AnyComponent
}
