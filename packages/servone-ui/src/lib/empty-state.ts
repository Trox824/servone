import type { Asset, IntlString } from '@hcengineering/platform'
import type { ComponentType } from 'svelte'
import { getContext, setContext } from 'svelte'
import type { Readable } from 'svelte/store'
import type { EmptyAction } from '../onboarding/empty-copy'
import type { AnySvelteComponent } from '../original'

export interface EmptyStateInfo {
  /** Falls back to lucide `Inbox`. */
  icon?: Asset | AnySvelteComponent | ComponentType
  iconProps?: Record<string, any>
  label: IntlString
  /** Whether the header shows a create button — gates the "Create one with the button above" hint. */
  hasCreate: boolean
  /** Zero rows while filtered means "no match" (upstream stays silent), not an empty page. */
  filtered: boolean
  copy?: { message: IntlString, actions: EmptyAction[] }
}

const KEY = 'servone.emptyState'

export function provideEmptyState (info: Readable<EmptyStateInfo>): void {
  setContext(KEY, info)
}

/** `undefined` outside a page that provides it. */
export function useEmptyState (): Readable<EmptyStateInfo> | undefined {
  return getContext<Readable<EmptyStateInfo> | undefined>(KEY)
}

export const emptyStateStrings = {
  title: 'view:string:ServoneEmptyTitle' as IntlString,
  hint: 'view:string:ServoneEmptyHint' as IntlString
}
