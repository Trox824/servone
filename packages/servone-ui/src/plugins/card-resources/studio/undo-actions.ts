const actions = new Map<string, () => void>()

export function registerUndoAction (changeId: string, action: () => void): void {
  actions.set(changeId, action)
}

export function takeUndoAction (changeId: string): (() => void) | undefined {
  const action = actions.get(changeId)
  actions.delete(changeId)
  return action
}
