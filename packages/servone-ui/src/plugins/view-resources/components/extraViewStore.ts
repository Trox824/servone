import { writable } from 'svelte/store'
import type { IntlString } from '@hcengineering/platform'
import type { AnySvelteComponent, Location } from '@hcengineering/ui'

export interface ExtraView {
  id: string
  label: IntlString
  icon: AnySvelteComponent
  isActive: boolean
  open: () => void
  recordsLocation: () => Location
}

export const extraViewStore = writable<ExtraView | undefined>(undefined)
