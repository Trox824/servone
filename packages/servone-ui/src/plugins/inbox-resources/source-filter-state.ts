import { writable } from 'svelte/store'
import type { Class, Doc, Ref } from '@hcengineering/core'
import type { SourceCount } from './source-filter'

export type Source = Ref<Class<Doc>>

export const hiddenSources = writable<ReadonlySet<Source>>(new Set())
export const loadedSources = writable<Array<SourceCount<Source>>>([])
export const isUnreadOnly = writable(false)
