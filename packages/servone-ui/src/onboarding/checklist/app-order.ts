import type { TeamFocus } from '../team-focus'

export const FOCUS_APP_ALIASES: Record<TeamFocus, string[]> = {
  projects: ['tracker', 'chunter', 'document', 'love', 'time'],
  operations: ['chunter', 'time', 'approval', 'contact', 'tracker'],
  both: ['chunter', 'tracker', 'time', 'approval', 'love']
}

export function focusAppOrder (apps: Array<{ _id: string, alias: string }>, focus: TeamFocus): string[] {
  return FOCUS_APP_ALIASES[focus].flatMap((alias) => apps.filter((app) => app.alias === alias).map((app) => app._id))
}
