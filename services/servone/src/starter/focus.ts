import type { Class, Ref, Tx, TxCreateDoc, TxUpdateDoc } from '@hcengineering/core'
import core from '@hcengineering/core'
import setting, { type WorkspaceSetting } from '@hcengineering/setting'
import type { SetupClient } from '../workflows/setup'
import type { StarterKey } from './content'

export type TeamFocus = 'projects' | 'operations' | 'both'

export const STARTER_SETS: Record<TeamFocus, readonly StarterKey[]> = {
  projects: ['invite', 'project', 'sprint', 'meeting'],
  operations: ['invite', 'managers', 'leave', 'meeting'],
  both: ['invite', 'project', 'leave', 'meeting']
}

interface TeamFocusSetting extends WorkspaceSetting {
  servoneTeamFocus?: string
  servoneSampleContent?: boolean
  servoneEmptyStarted?: boolean
}

export interface StarterSetup {
  focus: TeamFocus
  hasSampleContent: boolean
}
export const teamFocusClass: Ref<Class<TeamFocusSetting>> = setting.class.WorkspaceSetting

export function parseTeamFocus (raw: string | undefined): TeamFocus {
  return raw === 'projects' || raw === 'operations' ? raw : 'both'
}

export async function readTeamFocus (client: SetupClient): Promise<TeamFocus> {
  return (await readStarterSetup(client))?.focus ?? 'both'
}

export async function readStarterSetup (client: SetupClient): Promise<StarterSetup | undefined> {
  const settings = await client.findAll(teamFocusClass, {})
  const setup = settings.find((it) => it.servoneTeamFocus !== undefined)
  if (setup === undefined) return undefined
  return { focus: parseTeamFocus(setup.servoneTeamFocus), hasSampleContent: setup.servoneSampleContent !== false }
}

export function focusChanged (tx: Tx): boolean {
  if (tx._class === core.class.TxCreateDoc) {
    const create = tx as TxCreateDoc<TeamFocusSetting>
    return create.objectClass === setting.class.WorkspaceSetting && create.attributes.servoneTeamFocus !== undefined
  }
  if (tx._class === core.class.TxUpdateDoc) {
    const update = tx as TxUpdateDoc<TeamFocusSetting>
    return update.objectClass === setting.class.WorkspaceSetting && update.operations.servoneTeamFocus !== undefined
  }
  return false
}
