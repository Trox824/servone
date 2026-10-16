import type { EstimateScale } from './types'

export type TriageReason = 'points' | 'epic'

export interface TriageInput {
  points: number | null
  hasEpic: boolean
  isBug: boolean
}

/**
 * An item needs an estimate unless the project doesn't estimate, and an epic unless it's a bug
 * (bugs often stand alone) or the project has no epics to pick from.
 */
export function triageReasons (it: TriageInput, scale: EstimateScale, projectHasEpics: boolean): TriageReason[] {
  const reasons: TriageReason[] = []
  if (scale !== 'off' && it.points === null) reasons.push('points')
  if (projectHasEpics && !it.hasEpic && !it.isBug) reasons.push('epic')
  return reasons
}
