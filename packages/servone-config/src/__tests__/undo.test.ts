import { applyChange, approveChange, getChange, listChanges, saveDraft, undoChange } from '../changes'
import type { ConfigSession } from '../client'
import { describe as describeConfig } from '../describe'
import { toAccountUuid } from '../keys'
import { plan } from '../plan'
import type { ChangeRecord } from '../types'
import {
  addCard,
  addSpace,
  applyOps,
  attributeByKey,
  createWorkspace,
  type MemoryWorkspace,
  sessionFor,
  typeByKey
} from './harness'

// The type is created outside the change: undoing createType archives, which is always destructive.
async function appliedAddField (): Promise<{ ws: MemoryWorkspace, session: ConfigSession, change: ChangeRecord }> {
  const ws = createWorkspace()
  const session = sessionFor(ws)
  await applyOps(session, [{ op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' }])
  const draft = await saveDraft(
    session,
    await plan(session, [{ op: 'addField', type: 'nghi-phep', key: 'ly-do', name: 'Lý do', kind: { kind: 'text' } }])
  )
  await applyChange(session, draft.id)
  return { ws, session, change: draft }
}

async function hasReason (session: ConfigSession): Promise<boolean> {
  const type = (await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')
  return type?.fields.some((it) => it.key === 'ly-do') === true
}

describe('undoChange', () => {
  it('applies the inverse as a new change and marks the original undone', async () => {
    const { session, change } = await appliedAddField()
    const outcome = await undoChange(session, change.id)
    expect(outcome.kind).toBe('applied')
    expect(outcome.change).toMatchObject({ status: 'applied', undoOf: change.id })
    expect(outcome.change.ops.map((it) => it.op)).toEqual(['removeField'])
    expect((await getChange(session, change.id)).status).toBe('undone')
    expect(await hasReason(session)).toBe(false)
  })

  it('asks for confirmation when the undo destroys data', async () => {
    const { ws, session, change } = await appliedAddField()
    const type = await typeByKey(ws, 'nghi-phep')
    const reason = await attributeByKey(ws, type._id, 'ly-do')
    await addCard(ws, type._id, await addSpace(ws, 'Nhân sự'), { [reason.name]: 'Ốm' })

    const outcome = await undoChange(session, change.id)
    expect(outcome.kind).toBe('needsConfirm')
    expect((await getChange(session, change.id)).status).toBe('applied')
    expect(await hasReason(session)).toBe(true)
    const confirmed = await applyChange(session, outcome.change.id, { isConfirmed: true })
    expect(confirmed.kind).toBe('applied')
    expect((await getChange(session, change.id)).status).toBe('undone')
    expect(await hasReason(session)).toBe(false)
  })

  it('undoes to the access in place at apply time, not at draft time', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const approver = sessionFor(ws, 'hoa')
    const space = await addSpace(ws, 'Nhân sự')
    const lan = toAccountUuid('lan-uuid')
    const minh = toAccountUuid('minh-uuid')
    const hoa = toAccountUuid('hoa-uuid')
    await applyOps(session, [
      { op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' },
      { op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space, editor: [lan] }] } }
    ])
    const draft = await saveDraft(
      session,
      await plan(session, [{ op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space, editor: [minh] }] } }])
    )
    // Someone else changes the same space between drafting and applying.
    await applyOps(session, [{ op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space, editor: [hoa] }] } }])

    const submitted = await applyChange(session, draft.id)
    expect(submitted.kind).toBe('pendingApproval')
    expect((await approveChange(approver, draft.id)).kind).toBe('applied')
    const applied = await getChange(session, draft.id)
    expect(applied.inverse).toEqual([
      { op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space, isRestricted: true, editor: [hoa] }] } }
    ])

    const undo = await undoChange(session, draft.id)
    expect(undo.kind).toBe('pendingApproval')
    expect((await approveChange(approver, undo.change.id)).kind).toBe('applied')
    const leaveType = (await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')
    expect(leaveType?.access).toEqual([{ space, viewer: [], editor: [hoa], manager: [] }])
  })

  it('reuses the waiting undo draft instead of saving another', async () => {
    const { ws, session, change } = await appliedAddField()
    const type = await typeByKey(ws, 'nghi-phep')
    const reason = await attributeByKey(ws, type._id, 'ly-do')
    await addCard(ws, type._id, await addSpace(ws, 'Nhân sự'), { [reason.name]: 'Ốm' })
    const first = await undoChange(session, change.id)
    const second = await undoChange(session, change.id)
    expect(first.kind).toBe('needsConfirm')
    expect(second.change.id).toBe(first.change.id)
    expect((await listChanges(session)).filter((it) => it.undoOf === change.id)).toHaveLength(1)
  })

  it('only undoes applied changes', async () => {
    const session = sessionFor(createWorkspace())
    const draft = await saveDraft(session, await plan(session, [{ op: 'createType', key: 'a', name: 'A' }]))
    await expect(undoChange(session, draft.id)).rejects.toMatchObject({ code: 'wrong-status' })
  })
})
