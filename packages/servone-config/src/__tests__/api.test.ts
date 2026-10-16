import * as api from '../index'
import type { ApplyOutcome, ChangeId, ChangeRecord, ConfigSession, Operation, Plan } from '../index'
import type { ApplyOptions } from '../types'

describe('public API', () => {
  it('exports the runtime surface plans 2-6 rely on', () => {
    expect(Object.keys(api).sort()).toEqual([
      'BUNDLED_PACKS',
      'CATEGORIES',
      'CHANGE_SPACE',
      'CHANGE_TYPE',
      'ConfigError',
      'addStatus',
      'allActions',
      'applyChange',
      'approveChange',
      'baseTypeOf',
      'copyIdOf',
      'deleteStatus',
      'describe',
      'ensureOwnType',
      'exportPack',
      'findPack',
      'getChange',
      'isLockedType',
      'isSensitiveAutomation',
      'listChanges',
      'moveStatus',
      'ownerOf',
      'packContents',
      'packStatus',
      'parseChangeId',
      'parseOperations',
      'plan',
      'projectStatusGroups',
      'rejectChange',
      'renameStatus',
      'saveDraft',
      'setDefaultStatus',
      'setStatusApproval',
      'setStatusColor',
      'setTriage',
      'slugify',
      'statusApproval',
      'targetOf',
      'triageProjectClass',
      'undoChange'
    ])
  })

  it('keeps the documented signatures', () => {
    const planFn: (session: ConfigSession, ops: Operation[]) => Promise<Plan> = api.plan
    const saveFn: (session: ConfigSession, draft: Plan) => Promise<ChangeRecord> = api.saveDraft
    const applyFn: (session: ConfigSession, id: ChangeId, options?: ApplyOptions) => Promise<ApplyOutcome> = api.applyChange
    const undoFn: (session: ConfigSession, id: ChangeId, options?: ApplyOptions) => Promise<ApplyOutcome> = api.undoChange
    // approveChange can also return needsConfirm, so its signature matches applyChange's rather than the plan's ChangeRecord promise.
    const approveFn: (session: ConfigSession, id: ChangeId, options?: ApplyOptions) => Promise<ApplyOutcome> = api.approveChange
    expect([planFn, saveFn, applyFn, undoFn, approveFn].every((it) => typeof it === 'function')).toBe(true)
  })
})
