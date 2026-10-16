import { languageStore } from '@hcengineering/theme'
import { get } from 'svelte/store'
import { deviceOptionsStore, getLocalWeekStart } from '../original'

const LOCALE_BY_LANGUAGE: Record<string, string> = { vi: 'vi-VN' }
const WEEK_START_KEY = 'firstDayOfWeek'
const VI_WEEK_START = 1

let appLocale: string | undefined
let appLanguage = ''

function resolve (locales: Intl.LocalesArgument): Intl.LocalesArgument {
  const isBrowserDefault = locales === undefined || locales === 'default' || (Array.isArray(locales) && locales.length === 0)
  return isBrowserDefault && appLocale !== undefined ? appLocale : locales
}

function syncWeekStart (): void {
  if ((localStorage.getItem(WEEK_START_KEY) ?? 'system') !== 'system') return
  const weekStart = appLanguage === 'vi' ? VI_WEEK_START : getLocalWeekStart()
  if (get(deviceOptionsStore).firstDayOfWeek === weekStart) return
  deviceOptionsStore.update((options) => ({ ...options, firstDayOfWeek: weekStart }))
}

languageStore.subscribe((language) => {
  appLocale = LOCALE_BY_LANGUAGE[language]
  appLanguage = language
  syncWeekStart()
})
deviceOptionsStore.subscribe(syncWeekStart)

const dateToLocaleString = Date.prototype.toLocaleString
const dateToLocaleDateString = Date.prototype.toLocaleDateString
const dateToLocaleTimeString = Date.prototype.toLocaleTimeString
const numberToLocaleString = Number.prototype.toLocaleString
Date.prototype.toLocaleString = function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
  return dateToLocaleString.call(this, resolve(locales), options)
}
Date.prototype.toLocaleDateString = function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
  return dateToLocaleDateString.call(this, resolve(locales), options)
}
Date.prototype.toLocaleTimeString = function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
  return dateToLocaleTimeString.call(this, resolve(locales), options)
}
Number.prototype.toLocaleString = function (this: number, locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions) {
  return numberToLocaleString.call(this, resolve(locales), options)
}

Intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
  construct: (target, [locales, options]) => new target(resolve(locales), options),
  apply: (target, _receiver, [locales, options]) => target(resolve(locales), options)
})
Intl.NumberFormat = new Proxy(Intl.NumberFormat, {
  construct: (target, [locales, options]) => new target(resolve(locales), options),
  apply: (target, _receiver, [locales, options]) => target(resolve(locales), options)
})
