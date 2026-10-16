import { parseTeamFocus, type StarterSetup } from '../team-focus'

const PENDING_SETUP_PREFIX = 'servone:pending-setup:'
const FIRST_OPEN_PREFIX = 'servone:first-open:'

export function rememberPendingSetup (workspaceUrl: string, setup: StarterSetup): void {
  try {
    localStorage.setItem(`${PENDING_SETUP_PREFIX}${workspaceUrl}`, `${setup.focus}:${setup.hasSampleContent ? 'sample' : 'empty'}`)
  } catch {}
}

export function readPendingSetup (workspaceUrl: string): StarterSetup | undefined {
  try {
    const stored = localStorage.getItem(`${PENDING_SETUP_PREFIX}${workspaceUrl}`)
    if (stored === null) return undefined
    const [focus, content] = stored.split(':')
    return { focus: parseTeamFocus(focus), hasSampleContent: content !== 'empty' }
  } catch {
    return undefined
  }
}

export function clearPendingSetup (workspaceUrl: string): void {
  try {
    localStorage.removeItem(`${PENDING_SETUP_PREFIX}${workspaceUrl}`)
  } catch {}
}

export function hasOpenedBefore (workspaceUuid: string, accountUuid: string): boolean {
  try {
    return localStorage.getItem(`${FIRST_OPEN_PREFIX}${workspaceUuid}:${accountUuid}`) !== null
  } catch {
    return true
  }
}

export function markOpened (workspaceUuid: string, accountUuid: string): void {
  try {
    localStorage.setItem(`${FIRST_OPEN_PREFIX}${workspaceUuid}:${accountUuid}`, String(Date.now()))
  } catch {}
}
