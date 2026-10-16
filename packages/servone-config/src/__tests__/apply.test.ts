import { type Account, AccountRole, TxFactory } from '@hcengineering/core'
import { statusTx } from '../change-log'
import { applyChange, approveChange, commit, getChange, listChanges, rejectChange, replan, saveDraft } from '../changes'
import type { ConfigSession } from '../client'
import { describe as describeConfig } from '../describe'
import { toAccountUuid, toPersonId } from '../keys'
import type { Operation } from '../operations'
import { plan } from '../plan'
import type { ChangeRecord } from '../types'
import {
  accountFor,
  addCard,
  addSpace,
  applyOps,
  attributeByKey,
  createWorkspace,
  type MemoryWorkspace,
  sessionFor,
  typeByKey
} from './harness'

async function draftOf (session: ConfigSession, ops: Operation[]): Promise<ChangeRecord> {
  return await saveDraft(session, await plan(session, ops))
}

async function withLeaveType (): Promise<{ ws: MemoryWorkspace, session: ConfigSession }> {
  const ws = createWorkspace()
  const session = sessionFor(ws)
  await applyOps(session, [
    { op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' },
    { op: 'addField', type: 'nghi-phep', key: 'ly-do', name: 'Lý do', kind: { kind: 'text' } }
  ])
  return { ws, session }
}

async function hasField (session: ConfigSession, key: string): Promise<boolean> {
  const type = (await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')
  return type?.fields.some((it) => it.key === key) === true
}

describe('applyChange', () => {
  it('applies a safe draft', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await draftOf(session, [{ op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' }])
    const outcome = await applyChange(session, draft.id)
    expect(outcome.kind).toBe('applied')
    expect(outcome.change.status).toBe('applied')
    expect((await typeByKey(ws, 'nghi-phep'))._id).toBeDefined()
  })

  it('refuses a stale draft and writes nothing', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await draftOf(session, [{ op: 'createType', key: 'a', name: 'A' }])
    await applyOps(session, [{ op: 'createType', key: 'b', name: 'B' }])
    const sentBefore = ws.sent.length
    await expect(applyChange(session, draft.id)).rejects.toMatchObject({ code: 'stale' })
    expect(ws.sent).toHaveLength(sentBefore)
    expect((await getChange(session, draft.id)).status).toBe('draft')
  })

  it('asks for confirmation before destroying data', async () => {
    const { ws, session } = await withLeaveType()
    const type = await typeByKey(ws, 'nghi-phep')
    const reason = await attributeByKey(ws, type._id, 'ly-do')
    await addCard(ws, type._id, await addSpace(ws, 'Nhân sự'), { [reason.name]: 'Ốm' })
    const draft = await draftOf(session, [{ op: 'removeField', type: 'nghi-phep', field: 'ly-do' }])
    const unconfirmed = await applyChange(session, draft.id)
    expect(unconfirmed.kind).toBe('needsConfirm')
    expect(await hasField(session, 'ly-do')).toBe(true)
    const confirmed = await applyChange(session, draft.id, { isConfirmed: true })
    expect(confirmed.kind).toBe('applied')
    expect(await hasField(session, 'ly-do')).toBe(false)
  })

  it('uses the risk of the re-plan when data appeared after drafting', async () => {
    const { ws, session } = await withLeaveType()
    const draft = await draftOf(session, [{ op: 'removeField', type: 'nghi-phep', field: 'ly-do' }])
    expect(draft.risk).toBe('safe')
    const type = await typeByKey(ws, 'nghi-phep')
    const reason = await attributeByKey(ws, type._id, 'ly-do')
    await addCard(ws, type._id, await addSpace(ws, 'Nhân sự'), { [reason.name]: 'Ốm' })
    expect((await applyChange(session, draft.id)).kind).toBe('needsConfirm')
  })

  it('refuses changes that are not drafts', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await draftOf(session, [{ op: 'createType', key: 'a', name: 'A' }])
    await applyChange(session, draft.id)
    await expect(applyChange(session, draft.id)).rejects.toMatchObject({ code: 'wrong-status' })
  })

  it('refuses a non-Maintainer', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await draftOf(session, [{ op: 'createType', key: 'a', name: 'A' }])
    await expect(applyChange(sessionFor(ws, 'lan', AccountRole.User), draft.id)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('rejects a commit whose status moved since it was read', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await draftOf(session, [{ op: 'createType', key: 'a', name: 'A' }])
    const change = await getChange(session, draft.id)
    const replanned = await replan(session, change)
    // Stands in for a second approver committing (or rejecting) between this read and this write.
    await session.client.tx(statusTx(new TxFactory(session.account.primarySocialId), change.id, 'rejected'))
    const sentBefore = ws.sent.length
    await expect(commit(session, change, replanned)).rejects.toMatchObject({ code: 'wrong-status' })
    expect(ws.sent).toHaveLength(sentBefore)
    expect((await getChange(session, draft.id)).status).toBe('rejected')
    await expect(typeByKey(ws, 'a')).rejects.toThrow()
  })

  it('refuses the second of two changes drafted on the same model even past the pre-check', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const first = await draftOf(session, [{ op: 'createType', key: 'a', name: 'A' }])
    const second = await draftOf(session, [{ op: 'createType', key: 'a', name: 'A' }])
    // Both re-plans pass the fingerprint check before either writes, as two concurrent applies would.
    const firstReplan = await replan(session, first)
    const secondReplan = await replan(session, second)
    await commit(session, first, firstReplan)
    const sentBefore = ws.sent.length
    await expect(commit(session, second, secondReplan)).rejects.toMatchObject({ code: 'stale' })
    expect(ws.sent).toHaveLength(sentBefore)
    expect((await getChange(session, second.id)).status).toBe('draft')
    expect((await describeConfig(session)).types.filter((it) => it.key === 'a')).toHaveLength(1)
  })

  it('applies a change drafted after config was edited outside the change log', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    await applyChange(session, (await draftOf(session, [{ op: 'createType', key: 'a', name: 'A' }])).id)
    await applyOps(session, [{ op: 'createType', key: 'b', name: 'B' }])
    const draft = await draftOf(session, [{ op: 'createType', key: 'c', name: 'C' }])
    expect((await applyChange(session, draft.id)).kind).toBe('applied')
  })
})

describe('approval', () => {
  async function pendingAccess (): Promise<{ ws: MemoryWorkspace, session: ConfigSession, change: ChangeRecord }> {
    const { ws, session } = await withLeaveType()
    const space = await addSpace(ws, 'Nhân sự')
    const draft = await draftOf(session, [
      { op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space, editor: [toAccountUuid('minh-uuid')] }] } }
    ])
    const outcome = await applyChange(session, draft.id)
    expect(outcome.kind).toBe('pendingApproval')
    return { ws, session, change: outcome.change }
  }

  it('routes sensitive changes through a second maintainer', async () => {
    const { ws, session, change } = await pendingAccess()
    expect(change.status).toBe('pending')
    expect((await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')?.access).toEqual([])

    await expect(approveChange(session, change.id)).rejects.toMatchObject({ code: 'self-approval' })
    const author: Account = { ...accountFor('admin-alt'), socialIds: [toPersonId('admin-alt-social'), session.account.primarySocialId] }
    await expect(approveChange({ client: ws.client, account: author }, change.id)).rejects.toMatchObject({ code: 'self-approval' })
    await expect(approveChange(sessionFor(ws, 'lan', AccountRole.User), change.id)).rejects.toMatchObject({ code: 'forbidden' })

    const approved = await approveChange(sessionFor(ws, 'hoa'), change.id)
    expect(approved.kind).toBe('applied')
    expect(approved.change).toMatchObject({ status: 'applied', approver: 'hoa-social' })
    expect((await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')?.access).toHaveLength(1)
  })

  it('rejects a pending change and then refuses to approve it', async () => {
    const { ws, change } = await pendingAccess()
    const rejected = await rejectChange(sessionFor(ws, 'hoa'), change.id)
    expect(rejected.status).toBe('rejected')
    await expect(approveChange(sessionFor(ws, 'hoa'), change.id)).rejects.toMatchObject({ code: 'wrong-status' })
  })

  it('needs confirmation for the destructive part of a sensitive+destructive change on both submit and approval', async () => {
    const { ws, session } = await withLeaveType()
    const space = await addSpace(ws, 'Nhân sự')
    const draft = await draftOf(session, [
      { op: 'removeField', type: 'nghi-phep', field: 'ly-do' },
      { op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space, editor: [toAccountUuid('minh-uuid')] }] } }
    ])
    // No card holds the field yet, so the stored draft diff has no destructive line; the re-plan below does.
    expect(draft.diff.some((entry) => entry.risk === 'destructive')).toBe(false)
    const type = await typeByKey(ws, 'nghi-phep')
    const reason = await attributeByKey(ws, type._id, 'ly-do')
    await addCard(ws, type._id, space, { [reason.name]: 'Ốm' })

    const unconfirmed = await applyChange(session, draft.id)
    expect(unconfirmed.kind).toBe('needsConfirm')
    expect(unconfirmed.change.diff.some((entry) => entry.risk === 'destructive' && entry.affected === 1)).toBe(true)
    expect(await hasField(session, 'ly-do')).toBe(true)

    const submitted = await applyChange(session, draft.id, { isConfirmed: true })
    expect(submitted.kind).toBe('pendingApproval')

    const approverNeedsConfirm = await approveChange(sessionFor(ws, 'hoa'), submitted.change.id)
    expect(approverNeedsConfirm.kind).toBe('needsConfirm')
    expect(approverNeedsConfirm.change.diff.some((entry) => entry.risk === 'destructive' && entry.affected === 1)).toBe(true)
    expect(await hasField(session, 'ly-do')).toBe(true)

    const approved = await approveChange(sessionFor(ws, 'hoa'), submitted.change.id, { isConfirmed: true })
    expect(approved.kind).toBe('applied')
    expect(await hasField(session, 'ly-do')).toBe(false)
  })

  it('shows the approver a fresh diff when the model moved after submit', async () => {
    const { ws, session, change } = await pendingAccess()
    await applyOps(session, [{ op: 'updateType', type: 'nghi-phep', name: 'Nghỉ phép năm' }])
    const approver = sessionFor(ws, 'hoa')
    // The first read joins the change-log space; that write is not part of the preview.
    await listChanges(approver)
    const sentBefore = ws.sent.length

    const outcome = await approveChange(approver, change.id)
    expect(outcome.kind).toBe('needsConfirm')
    expect(outcome.change.diff.some((entry) => entry.text.includes('Nghỉ phép năm'))).toBe(true)
    expect(change.diff.some((entry) => entry.text.includes('Nghỉ phép năm'))).toBe(false)
    expect(ws.sent).toHaveLength(sentBefore)
    expect((await getChange(session, change.id)).status).toBe('pending')
  })

  it('applies the re-plan once the approver confirms a drifted change', async () => {
    const { ws, session, change } = await pendingAccess()
    await applyOps(session, [{ op: 'createType', key: 'unrelated', name: 'Unrelated' }])
    const approved = await approveChange(sessionFor(ws, 'hoa'), change.id, { isConfirmed: true })
    expect(approved.kind).toBe('applied')
    expect(approved.change).toMatchObject({ status: 'applied', approver: 'hoa-social' })
    expect((await describeConfig(session)).types.find((it) => it.key === 'nghi-phep')?.access).toHaveLength(1)
  })

  it('refuses approval when the moved model makes the change invalid', async () => {
    const { ws, session, change } = await pendingAccess()
    await applyOps(session, [{ op: 'archiveType', type: 'nghi-phep' }])
    await expect(approveChange(sessionFor(ws, 'hoa'), change.id, { isConfirmed: true })).rejects.toMatchObject({ code: 'invalid' })
    expect((await getChange(session, change.id)).status).toBe('pending')
  })
})

describe('rejectChange', () => {
  it('refuses a non-Maintainer', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await draftOf(session, [{ op: 'createType', key: 'a', name: 'A' }])
    await expect(rejectChange(sessionFor(ws, 'lan', AccountRole.User), draft.id)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('refuses an applied change', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await draftOf(session, [{ op: 'createType', key: 'a', name: 'A' }])
    await applyChange(session, draft.id)
    await expect(rejectChange(session, draft.id)).rejects.toMatchObject({ code: 'wrong-status' })
  })

  it('refuses an already-rejected change', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await draftOf(session, [{ op: 'createType', key: 'a', name: 'A' }])
    await rejectChange(session, draft.id)
    await expect(rejectChange(session, draft.id)).rejects.toMatchObject({ code: 'wrong-status' })
  })
})
