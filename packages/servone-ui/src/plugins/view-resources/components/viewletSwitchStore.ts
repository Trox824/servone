import { writable } from 'svelte/store'
import type { Ref, WithLookup } from '@hcengineering/core'
import type { Viewlet } from '@hcengineering/view'

export interface ViewletSwitchEntry {
  key: string
  viewlets: Array<WithLookup<Viewlet>>
}

export const viewletSwitchStore = writable<ViewletSwitchEntry[]>([])

export function publishViewlets (entry: ViewletSwitchEntry, previous?: ViewletSwitchEntry): void {
  viewletSwitchStore.update((entries) => [...entries.filter((e) => e !== previous), entry])
}

export function retractViewlets (entry: ViewletSwitchEntry | undefined): void {
  if (entry === undefined) return
  viewletSwitchStore.update((entries) => entries.filter((e) => e !== entry))
}

export function findViewletSwitch (
  entries: ViewletSwitchEntry[],
  viewlet: Ref<Viewlet> | undefined
): ViewletSwitchEntry | undefined {
  if (viewlet === undefined) return undefined
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].viewlets.some((v) => v._id === viewlet)) return entries[i]
  }
  return undefined
}
