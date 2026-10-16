import core, { type Class, type Ref } from '@hcengineering/core'
import setting, { type WorkspaceSetting } from '@hcengineering/setting'

export type TeamFocus = 'projects' | 'operations' | 'both'

export const TEAM_FOCUSES: TeamFocus[] = ['projects', 'operations', 'both']

export interface TeamFocusSetting extends WorkspaceSetting {
  servoneTeamFocus?: TeamFocus
  servoneSampleContent?: boolean
}

export interface StarterSetup {
  focus: TeamFocus
  hasSampleContent: boolean
}

export const teamFocusClass: Ref<Class<TeamFocusSetting>> = setting.class.WorkspaceSetting

export const TEAM_FOCUS_SPACE = core.space.Workspace

export function parseTeamFocus (raw: string | undefined): TeamFocus {
  return TEAM_FOCUSES.find((focus) => focus === raw) ?? 'both'
}
