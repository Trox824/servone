// Hidden JSON attribute on a workflow Project, written by its SLA & automation tab and read by
// services/servone/src/handoff. Any client can write it, so it is parsed where it is read.
export interface StoredHandoff {
  servoneHandoff?: unknown
}

export const HANDOFF_FIELD = 'servoneHandoff' satisfies keyof StoredHandoff

export const HANDOFF_ASSIGNEES = ['none', 'same', 'person'] as const

export type HandoffAssignee = { kind: 'none' } | { kind: 'same' } | { kind: 'person', person: string }

// Ids stay plain strings: this package has no platform dependency, each side brands them.
export interface Handoff {
  stage: string
  target: string
  assignee: HandoffAssignee
}

export function handoffToJson (handoff: Handoff): string {
  return JSON.stringify(handoff)
}

function parseJson (text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    if (err instanceof SyntaxError) return undefined
    throw err
  }
}

function parseAssignee (stored: unknown): HandoffAssignee | undefined {
  if (typeof stored !== 'object' || stored === null || !('kind' in stored)) return undefined
  if (stored.kind === 'none' || stored.kind === 'same') return { kind: stored.kind }
  if (stored.kind === 'person' && 'person' in stored && typeof stored.person === 'string' && stored.person !== '') {
    return { kind: 'person', person: stored.person }
  }
  return undefined
}

export function parseHandoff (project: StoredHandoff): Handoff | undefined {
  if (typeof project.servoneHandoff !== 'string') return undefined
  const stored = parseJson(project.servoneHandoff)
  if (typeof stored !== 'object' || stored === null || !('stage' in stored && 'target' in stored)) return undefined
  const { stage, target } = stored
  if (typeof stage !== 'string' || stage === '' || typeof target !== 'string' || target === '') return undefined
  const assignee = parseAssignee('assignee' in stored ? stored.assignee : undefined)
  return assignee === undefined ? undefined : { stage, target, assignee }
}
