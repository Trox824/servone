import type { Doc, Ref, Space } from '@hcengineering/core'
import { writable } from 'svelte/store'

export const searchScope = writable<Ref<Space> | undefined>(undefined)
export const searchPanelFor = writable<Ref<Doc> | undefined>(undefined)
