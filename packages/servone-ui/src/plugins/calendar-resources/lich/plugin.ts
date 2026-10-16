import type { IntlString, Plugin } from '@hcengineering/platform'
import type { AnyComponent } from '@hcengineering/ui'
import { en, type StringKey } from './strings'

export const servoneCalendarId = 'servone-calendar' as Plugin

export const str = Object.fromEntries(
  Object.keys(en).map((k) => [k, `${servoneCalendarId}:string:${k}` as IntlString])
) as Record<StringKey, IntlString>

export const component = {
  Lich: `${servoneCalendarId}:component:Lich` as AnyComponent,
  NeedsYouSwitcher: `${servoneCalendarId}:component:NeedsYouSwitcher` as AnyComponent
}
