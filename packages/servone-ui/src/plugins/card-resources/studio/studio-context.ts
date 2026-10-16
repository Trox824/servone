import type { ConfigSession } from '@servone/config'
import type { StudioContext } from './extensions'
import { guarded, showIssues, showPartial, showStale, studioApi } from './huly'
import type { StudioRoute } from './routes'
import { applyDraft, approveWithUi, saveOps, undoWithUi, type SaveResult, type SaveUi } from './save'

export interface StudioContextDeps {
  session: ConfigSession
  ui: SaveUi
  reload: () => Promise<void>
  open: (route: StudioRoute) => void
}

export function createStudioContext (deps: StudioContextDeps): StudioContext {
  const api = studioApi(deps.session)

  async function settled (outcome: SaveResult): Promise<SaveResult> {
    if (outcome.kind === 'partial') showPartial(outcome.changes)
    const stop = outcome.kind === 'partial' ? outcome.stopped : outcome
    if (stop.kind === 'invalid') showIssues(stop.issues)
    if (stop.kind === 'stale') showStale()
    await deps.reload()
    return outcome
  }

  return {
    session: deps.session,
    save: async (ops, options) => await settled(await guarded(async () => await saveOps(api, deps.ui, ops, options))),
    applyDraft: async (id) => await settled(await guarded(async () => await applyDraft(api, deps.ui, id))),
    undo: async (id) => await settled(await guarded(async () => await undoWithUi(api, deps.ui, id))),
    approve: async (id) => await settled(await guarded(async () => await approveWithUi(api, deps.ui, id))),
    reject: async (id) => {
      await settled(
        await guarded(async () => {
          await api.reject(id)
          return { kind: 'unchanged' }
        })
      )
    },
    reload: deps.reload,
    open: deps.open
  }
}
