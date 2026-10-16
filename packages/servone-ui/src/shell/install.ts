import { getMetadata, setMetadata, type Metadata } from '@hcengineering/platform'
import { get } from 'svelte/store'
import { location, navigate, rootBarExtensions } from '../original'
import MasterSearch from './MasterSearch.svelte'
import TopRight from './TopRight.svelte'
import TeamMentionChip from '../components/TeamMentionChip.svelte'
import { departmentClass } from '../lib/team-mentions'
import { hiddenAppRedirect } from '../lib/app-rail'
import { watchPhoneNav } from '../lib/phone-nav'

const ID = 'servone-master-search'
const ORDER = 5000

function ensurePushed (): void {
  const current = get(rootBarExtensions)
  if (current.some((it) => it[1].id === ID)) return
  rootBarExtensions.update((cur) => [...cur, ['left', { id: ID, component: MasterSearch as any, order: ORDER }]])
}

const TOP_RIGHT_ID = 'servone-top-right'
const TOP_RIGHT_ORDER = 50000

function ensureTopRightPushed (): void {
  const current = get(rootBarExtensions)
  if (current.some((it) => it[1].id === TOP_RIGHT_ID)) return
  rootBarExtensions.update((cur) => [
    ...cur,
    ['right', { id: TOP_RIGHT_ID, component: TopRight as any, order: TOP_RIGHT_ORDER }]
  ])
}

const CONTROL_EXT_ID = 'love:component:ControlExt'

function relocateControlExt (): void {
  const current = get(rootBarExtensions)
  const needsMove = current.some((it) => it[1].id === CONTROL_EXT_ID && it[0] === 'left')
  if (!needsMove) return
  rootBarExtensions.update((cur) =>
    cur.map((it) => (it[1].id === CONTROL_EXT_ID && it[0] === 'left' ? (['right', it[1]] as typeof it) : it))
  )
}

const WORKBENCH_ROUTE = 'workbench'
const DEFAULT_APP = 'workbench:metadata:DefaultApplication' as Metadata<string>
const FALLBACK_APP = 'tracker'

location.subscribe((loc) => {
  queueMicrotask(ensurePushed)
  queueMicrotask(ensureTopRightPushed)
  if (loc.path[0] !== WORKBENCH_ROUTE) return
  const redirect = hiddenAppRedirect(loc, getMetadata(DEFAULT_APP) ?? FALLBACK_APP)
  if (redirect !== undefined) queueMicrotask(() => navigate(redirect, true))
})
rootBarExtensions.subscribe(() => {
  queueMicrotask(relocateControlExt)
})

const MENTION_CHIPS = 'servone:metadata:MentionChips' as Metadata<Record<string, typeof TeamMentionChip>>
setMetadata(MENTION_CHIPS, { [departmentClass]: TeamMentionChip })

queueMicrotask(watchPhoneNav)
