import { MAIL_APP_COMPONENT, MAIL_APP_ICON, MAIL_PLUGIN_ID } from '@servone/mail'
import { translateCB, type Asset, type IntlString, type Plugin } from '@hcengineering/platform'
import { themeStore, type AnyComponent } from '@hcengineering/ui'
import { get } from 'svelte/store'
import { en, type StringKey } from './strings'

export const mailId = MAIL_PLUGIN_ID as Plugin

export const str = Object.fromEntries(
  Object.keys(en).map((key) => [key, `${mailId}:string:${key}` as IntlString])
) as Record<StringKey, IntlString>

export const mailIcon = MAIL_APP_ICON as Asset

export const component = {
  MailApp: MAIL_APP_COMPONENT as AnyComponent
}

export function text (key: StringKey, params: Record<string, string | number> = {}): string {
  let translated: string = en[key]
  translateCB(str[key], params, get(themeStore).language, (message) => { translated = message })
  return translated
}
