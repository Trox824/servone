import { translateCB, type IntlString } from '@hcengineering/platform'
import { themeStore } from '@hcengineering/theme'
import { derived, type Readable } from 'svelte/store'

export function intl (key: IntlString): Readable<string> {
  return derived(themeStore, (theme, set) => {
    translateCB(key, {}, theme.language, set)
  }, '')
}
