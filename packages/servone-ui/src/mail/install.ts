import { addLocation, addStringsLoader, loadMetadata } from '@hcengineering/platform'
import { mailIcon, mailId } from './plugin'
import { en, vi, type StringKey } from './strings'

async function loadStrings (lang: string): Promise<{ string: Record<StringKey, string> }> {
  const strings: Record<StringKey, string> = { ...en }
  if (lang === 'vi') Object.assign(strings, vi)
  return { string: strings }
}

export function installMail (): void {
  addLocation(mailId, async () => await import(/* webpackChunkName: "servone-mail" */ './resources'))
  addStringsLoader(mailId, loadStrings)
  const sprite = require('./assets/mail.svg') as string // eslint-disable-line
  loadMetadata({ mail: mailIcon }, { mail: `${sprite}#mail` })
}

installMail()
