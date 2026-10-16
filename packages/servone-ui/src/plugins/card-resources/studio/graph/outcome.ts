import type { SaveResult, SaveStop } from '../save'

function reasonsOf (stop: SaveStop): string[] {
  return stop.kind === 'invalid' ? stop.issues.map((it) => it.message) : []
}

export function refusalsOf (outcome: SaveResult): string[] {
  if (outcome.kind === 'partial') return reasonsOf(outcome.stopped)
  if (outcome.kind === 'invalid') return reasonsOf(outcome)
  return []
}
