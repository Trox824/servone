import type { ChangeId, ChangeRecord, Operation, Plan } from '@servone/config'
import {
  applyDraft,
  approveWithUi,
  batchesOf,
  saveOps,
  undoWithUi,
  type ApplyStep,
  type SaveUi,
  type StudioApi
} from '../save'
import { change, changeId, planned } from './fixtures'

class FakeApi implements StudioApi {
  readonly calls: string[] = []
  private drafts = 0

  constructor (
    private readonly steps: ApplyStep[],
    private readonly planFor: (ops: Operation[]) => Plan = (ops) => planned(ops)
  ) {}

  async plan (ops: Operation[]): Promise<Plan> {
    this.calls.push(`plan:${ops.map((it) => it.op).join(',')}`)
    return this.planFor(ops)
  }

  async saveDraft (draft: Plan): Promise<ChangeRecord> {
    this.drafts += 1
    this.calls.push(`draft:d${this.drafts}`)
    return change(`d${this.drafts}`, { ops: draft.ops })
  }

  async apply (id: ChangeId, isConfirmed: boolean): Promise<ApplyStep> {
    this.calls.push(`apply:${id}:${String(isConfirmed)}`)
    return this.next()
  }

  async approve (id: ChangeId, isConfirmed: boolean): Promise<ApplyStep> {
    this.calls.push(`approve:${id}:${String(isConfirmed)}`)
    return this.next()
  }

  async reject (id: ChangeId): Promise<ChangeRecord> {
    this.calls.push(`reject:${id}`)
    return change(id, { status: 'rejected' })
  }

  async undo (id: ChangeId): Promise<ApplyStep> {
    this.calls.push(`undo:${id}`)
    return this.next()
  }

  private next (): ApplyStep {
    const step = this.steps.shift()
    if (step === undefined) throw new Error('unexpected apply')
    return step
  }
}

interface RecordingUi extends SaveUi {
  log: string[]
}

function recordingUi (answers: boolean[] = []): RecordingUi {
  const log: string[] = []
  return {
    log,
    confirm: async (asked, phrase) => {
      log.push(`confirm:${asked.id}:${phrase ?? ''}`)
      return answers.shift() ?? false
    },
    applied: (done) => {
      log.push(`applied:${done.id}`)
    },
    pending: (waiting) => {
      log.push(`pending:${waiting.id}`)
    }
  }
}

const applied = (id: string): ApplyStep => ({ kind: 'applied', change: change(id, { status: 'applied' }) })
const needsConfirm = (id: string): ApplyStep => ({ kind: 'needsConfirm', change: change(id, { risk: 'destructive' }) })
const pending = (id: string): ApplyStep => ({ kind: 'pendingApproval', change: change(id, { status: 'pending', risk: 'sensitive' }) })
const stale: ApplyStep = { kind: 'stale' }

const addField: Operation = { op: 'addField', type: 'nghi-phep', key: 'ly-do', name: 'Lý do', kind: { kind: 'text' } }
const removeField: Operation = { op: 'removeField', type: 'nghi-phep', field: 'ly-do' }
const setAccess: Operation = { op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space: 'hr', isRestricted: true }] } }

describe('saveOps risk routing', () => {
  it('applies safe changes without asking', async () => {
    const api = new FakeApi([applied('d1')])
    const ui = recordingUi()
    const outcome = await saveOps(api, ui, [addField])
    expect(outcome.kind).toBe('applied')
    expect(api.calls).toEqual(['plan:addField', 'draft:d1', 'apply:d1:false'])
    expect(ui.log).toEqual(['applied:d1'])
  })

  it('asks before destructive changes and applies only after a yes', async () => {
    const api = new FakeApi([needsConfirm('d1'), applied('d1')])
    const ui = recordingUi([true])
    const outcome = await saveOps(api, ui, [removeField], { confirmPhrase: 'Lý do' })
    expect(outcome.kind).toBe('applied')
    expect(api.calls).toEqual(['plan:removeField', 'draft:d1', 'apply:d1:false', 'apply:d1:true'])
    expect(ui.log).toEqual(['confirm:d1:Lý do', 'applied:d1'])
  })

  it('asks before destructive changes and rejects the draft on cancel', async () => {
    const api = new FakeApi([needsConfirm('d1')])
    const ui = recordingUi([false])
    const outcome = await saveOps(api, ui, [removeField])
    expect(outcome).toEqual({ kind: 'cancelled' })
    expect(api.calls).toEqual(['plan:removeField', 'draft:d1', 'apply:d1:false', 'reject:d1'])
    expect(ui.log).toEqual(['confirm:d1:'])
  })

  it('confirms a destructive line before a sensitive change goes for approval', async () => {
    const api = new FakeApi([needsConfirm('d1'), pending('d1')])
    const ui = recordingUi([true])
    const outcome = await saveOps(api, ui, [removeField, setAccess])
    expect(outcome.kind).toBe('pending')
    expect(api.calls).toEqual(['plan:removeField,setAccess', 'draft:d1', 'apply:d1:false', 'apply:d1:true'])
    expect(ui.log).toEqual(['confirm:d1:', 'pending:d1'])
  })

  it('sends sensitive changes for approval without applying', async () => {
    const api = new FakeApi([pending('d1')])
    const ui = recordingUi()
    const outcome = await saveOps(api, ui, [setAccess])
    expect(outcome.kind).toBe('pending')
    expect(api.calls).toEqual(['plan:setAccess', 'draft:d1', 'apply:d1:false'])
    expect(ui.log).toEqual(['pending:d1'])
  })

  it('stops on validation issues before saving a draft', async () => {
    const issue = { opIndex: 0, code: 'duplicate-name' as const, message: 'Trùng tên' }
    const api = new FakeApi([], (ops) => planned(ops, { issues: [issue] }))
    const outcome = await saveOps(api, recordingUi(), [addField])
    expect(outcome).toEqual({ kind: 'invalid', issues: [issue] })
    expect(api.calls).toEqual(['plan:addField'])
  })

  it('saves nothing when the plan has no transactions', async () => {
    const api = new FakeApi([], (ops) => planned(ops, { txes: [] }))
    expect(await saveOps(api, recordingUi(), [addField])).toEqual({ kind: 'unchanged' })
    expect(api.calls).toEqual(['plan:addField'])
  })
})

describe('saveOps apply errors', () => {
  it('rejects its own draft when apply throws, then rethrows', async () => {
    const api = new FakeApi([])
    await expect(saveOps(api, recordingUi(), [addField])).rejects.toThrow('unexpected apply')
    expect(api.calls).toEqual(['plan:addField', 'draft:d1', 'apply:d1:false', 'reject:d1'])
  })
})

describe('saveOps stale drafts', () => {
  it('rejects a stale draft and retries once with a fresh plan', async () => {
    const api = new FakeApi([stale, applied('d2')])
    const outcome = await saveOps(api, recordingUi(), [addField])
    expect(outcome.kind).toBe('applied')
    expect(api.calls).toEqual(['plan:addField', 'draft:d1', 'apply:d1:false', 'reject:d1', 'plan:addField', 'draft:d2', 'apply:d2:false'])
  })

  it('re-plans and asks again when the confirmed apply turns stale', async () => {
    const api = new FakeApi([needsConfirm('d1'), stale, needsConfirm('d2'), applied('d2')])
    const ui = recordingUi([true, true])
    const outcome = await saveOps(api, ui, [removeField])
    expect(outcome.kind).toBe('applied')
    expect(api.calls).toEqual([
      'plan:removeField', 'draft:d1', 'apply:d1:false', 'apply:d1:true', 'reject:d1',
      'plan:removeField', 'draft:d2', 'apply:d2:false', 'apply:d2:true'
    ])
    expect(ui.log).toEqual(['confirm:d1:', 'confirm:d2:', 'applied:d2'])
  })

  it('gives up after the second stale apply', async () => {
    const api = new FakeApi([stale, stale])
    expect(await saveOps(api, recordingUi(), [addField])).toEqual({ kind: 'stale' })
    expect(api.calls.filter((it) => it.startsWith('plan'))).toHaveLength(2)
    expect(api.calls.filter((it) => it.startsWith('reject'))).toEqual(['reject:d1', 'reject:d2'])
  })
})

describe('setView after creating a type', () => {
  const create: Operation = { op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác' }
  const copy: Operation = { op: 'copyType', from: 'nghi-phep', key: 'cong-tac', name: 'Đề nghị công tác' }
  const view: Operation = { op: 'setView', type: 'cong-tac', view: { columns: ['ly-do'] } }
  const otherView: Operation = { op: 'setView', type: 'nghi-phep', view: { groupBy: null } }

  it('splits only at a setView on a type created earlier in the list', () => {
    expect(batchesOf([create, addField, view])).toEqual([[create, addField], [view]])
    expect(batchesOf([copy, view, addField])).toEqual([[copy], [view, addField]])
    expect(batchesOf([otherView, addField])).toEqual([[otherView, addField]])
    expect(batchesOf([])).toEqual([])
  })

  it('applies setView on a new type as a second change', async () => {
    const api = new FakeApi([applied('d1'), applied('d2')])
    const outcome = await saveOps(api, recordingUi(), [create, view])
    expect(outcome).toEqual({ kind: 'applied', changes: [change('d1', { status: 'applied' }), change('d2', { status: 'applied' })] })
    expect(api.calls).toEqual(['plan:createType', 'draft:d1', 'apply:d1:false', 'plan:setView', 'draft:d2', 'apply:d2:false'])
  })

  it('reports the applied first change when the second batch is cancelled', async () => {
    const api = new FakeApi([applied('d1'), needsConfirm('d2')])
    const ui = recordingUi([false])
    const outcome = await saveOps(api, ui, [create, view])
    expect(outcome).toEqual({ kind: 'partial', changes: [change('d1', { status: 'applied' })], stopped: { kind: 'cancelled' } })
    expect(api.calls).toContain('reject:d2')
    expect(ui.log).toEqual(['applied:d1', 'confirm:d2:'])
  })

  it('stops before the view change when the create is not applied', async () => {
    const api = new FakeApi([pending('d1')])
    const outcome = await saveOps(api, recordingUi(), [create, view])
    expect(outcome.kind).toBe('pending')
    expect(api.calls).not.toContain('plan:setView')
  })
})

describe('batches for fields added in the same list', () => {
  const restore: Operation = {
    op: 'restoreField',
    type: 'nghi-phep',
    key: 'ly-do',
    name: 'Lý do',
    kind: { kind: 'text' },
    attributeId: 'attr-1',
    attributeName: 'lyDo'
  }
  const columnsView: Operation = { op: 'setView', type: 'nghi-phep', view: { columns: ['ly-do'] } }
  const groupView: Operation = { op: 'setView', type: 'nghi-phep', view: { groupBy: 'ly-do' } }
  const otherTypeView: Operation = { op: 'setView', type: 'cong-tac', view: { columns: ['ly-do'] } }
  const unrelatedView: Operation = { op: 'setView', type: 'nghi-phep', view: { columns: ['ngay'] } }
  const addSelect: Operation = {
    op: 'addField',
    type: 'nghi-phep',
    key: 'loai',
    name: 'Loại',
    kind: { kind: 'select', options: ['Năm'] }
  }
  const options = (field: string): Operation => ({ op: 'setOptions', type: 'nghi-phep', field, options: [{ add: 'Ốm' }] })

  it('splits at a setView naming a field added or restored earlier on the same type', () => {
    expect(batchesOf([addField, columnsView])).toEqual([[addField], [columnsView]])
    expect(batchesOf([addField, groupView])).toEqual([[addField], [groupView]])
    expect(batchesOf([restore, columnsView])).toEqual([[restore], [columnsView]])
  })

  it('splits at a setView on another type naming the added key, since core resolves inherited fields', () => {
    expect(batchesOf([addField, otherTypeView])).toEqual([[addField], [otherTypeView]])
  })

  it('keeps a setView that names no new field in the same batch', () => {
    expect(batchesOf([addField, unrelatedView])).toEqual([[addField, unrelatedView]])
    expect(batchesOf([columnsView, addField])).toEqual([[columnsView, addField]])
  })

  it('splits at a setOptions on a field whose options changed earlier in the batch', () => {
    expect(batchesOf([addSelect, options('loai')])).toEqual([[addSelect], [options('loai')]])
    expect(batchesOf([options('loai'), options('loai')])).toEqual([[options('loai')], [options('loai')]])
    expect(batchesOf([options('loai'), options('muc-do')])).toEqual([[options('loai'), options('muc-do')]])
    expect(batchesOf([restore, options('ly-do')])).toEqual([[restore], [options('ly-do')]])
  })

  it('forgets earlier fields once a new batch starts', () => {
    expect(batchesOf([addField, columnsView, options('ly-do')])).toEqual([[addField], [columnsView, options('ly-do')]])
  })
})

describe('applyDraft, undoWithUi and approveWithUi', () => {
  it('applies a draft made elsewhere through the same confirm flow', async () => {
    const api = new FakeApi([needsConfirm('mcp-1'), applied('mcp-1')])
    const ui = recordingUi([true])
    expect((await applyDraft(api, ui, changeId('mcp-1'))).kind).toBe('applied')
    expect(api.calls).toEqual(['apply:mcp-1:false', 'apply:mcp-1:true'])
  })

  it('leaves a draft made elsewhere as a draft when the confirm is cancelled', async () => {
    const api = new FakeApi([needsConfirm('mcp-1')])
    const ui = recordingUi([false])
    expect(await applyDraft(api, ui, changeId('mcp-1'))).toEqual({ kind: 'cancelled' })
    expect(api.calls).toEqual(['apply:mcp-1:false'])
  })

  it('confirms an undo that destroys data', async () => {
    const api = new FakeApi([needsConfirm('u1'), applied('u1')])
    const ui = recordingUi([true])
    const outcome = await undoWithUi(api, ui, changeId('c1'))
    expect(outcome.kind).toBe('applied')
    expect(api.calls).toEqual(['undo:c1', 'apply:u1:true'])
    expect(ui.log).toEqual(['confirm:u1:', 'applied:u1'])
  })

  it('reports a stale undo without retrying', async () => {
    const api = new FakeApi([stale])
    expect(await undoWithUi(api, recordingUi(), changeId('c1'))).toEqual({ kind: 'stale' })
    expect(api.calls).toEqual(['undo:c1'])
  })

  it('approve asks before a destructive re-plan', async () => {
    const api = new FakeApi([needsConfirm('p1'), applied('p1')])
    const ui = recordingUi([true])
    const outcome = await approveWithUi(api, ui, changeId('p1'))
    expect(outcome).toEqual({ kind: 'applied', changes: [change('p1', { status: 'applied' })] })
    expect(api.calls).toEqual(['approve:p1:false', 'approve:p1:true'])
    expect(ui.log).toEqual(['confirm:p1:', 'applied:p1'])
  })

  it('approve cancel leaves the change pending', async () => {
    const api = new FakeApi([needsConfirm('p1')])
    const ui = recordingUi([false])
    expect(await approveWithUi(api, ui, changeId('p1'))).toEqual({ kind: 'cancelled' })
    expect(api.calls).toEqual(['approve:p1:false'])
  })

  it('approve reports a stale re-plan without rejecting', async () => {
    const api = new FakeApi([stale])
    expect(await approveWithUi(api, recordingUi(), changeId('p1'))).toEqual({ kind: 'stale' })
    expect(api.calls).toEqual(['approve:p1:false'])
  })
})
