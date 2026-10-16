import { getAccountClient, getLoginInfo } from '../utils'

const CHOSEN_KEY = 'servone:lang-chosen'
const LANGUAGE_KEY = 'lang'
const SUPPORTED_LOCALES = ['en', 'vi']

export function markLanguageChosen (): void {
  try {
    localStorage.setItem(CHOSEN_KEY, '1')
  } catch {}
}

function readStored (key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export async function syncAccountLocale (applyLanguage: (language: string) => void): Promise<void> {
  const loginInfo = await getLoginInfo()
  if (loginInfo === null) return

  const client = getAccountClient()
  const current = readStored(LANGUAGE_KEY)
  const hasChosen = readStored(CHOSEN_KEY) === '1'
  const { locale } = await client.getAccountInfo(loginInfo.account)
  const accountLocale = SUPPORTED_LOCALES.find((supported) => supported === locale)

  if (!hasChosen && accountLocale !== undefined) {
    if (accountLocale !== current) applyLanguage(accountLocale)
    return
  }
  if (current !== null && SUPPORTED_LOCALES.includes(current) && current !== accountLocale) {
    await client.setMyLocale({ locale: current })
  }
}
