import core, { type Ref } from '@hcengineering/core'
import { addLocation, addStringsLoader, type IntlString, type Plugin } from '@hcengineering/platform'
import type { AnyComponent } from '@hcengineering/ui'
import view from '@hcengineering/view'
import workbench, { WidgetType, type Widget } from '@hcengineering/workbench'
import { en, vi } from './strings'

const sidebarId = 'servone-sidebar' as Plugin

addLocation(sidebarId, async () => await import(/* webpackChunkName: "servone-sidebar" */ './related-resources'))
addStringsLoader(sidebarId, async (lang: string) => ({ string: lang === 'vi' ? { ...en, ...vi } : en }))

export const relatedWidget = {
  _id: 'servone:widget:Related' as Ref<Widget>,
  _class: workbench.class.Widget,
  space: core.space.Model,
  modifiedOn: 0,
  modifiedBy: core.account.System,
  label: `${sidebarId}:string:Related` as IntlString,
  icon: view.icon.CopyLink,
  type: WidgetType.Fixed,
  component: `${sidebarId}:component:RelatedPanel` as AnyComponent
} satisfies Widget
