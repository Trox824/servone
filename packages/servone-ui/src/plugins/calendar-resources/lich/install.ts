import { addLocation, addStringsLoader } from '@hcengineering/platform'
import { servoneCalendarId } from './plugin'
import { en, vi } from './strings'

export function installLich (): void {
  addLocation(servoneCalendarId, async () => await import(/* webpackChunkName: "servone-calendar" */ './resources'))
  addStringsLoader(servoneCalendarId, async (lang: string) => ({ string: lang === 'vi' ? { ...en, ...vi } : en }))
}

installLich()
