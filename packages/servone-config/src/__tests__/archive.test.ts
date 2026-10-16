import card from '@hcengineering/card'
import { describe as describeConfig } from '../describe'
import { plan } from '../plan'
import { addCard, addSpace, applyOps, createWorkspace, sessionFor, typeByKey } from './harness'

describe('archiveType', () => {
  it('refuses to archive system types', async () => {
    const ws = createWorkspace()
    const planned = await plan(sessionFor(ws), [{ op: 'archiveType', type: card.types.Document }])
    expect(planned.issues[0]).toMatchObject({ opIndex: 0, code: 'system-protected' })
  })

  it('archives a customer type as destructive and keeps its records', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const hr = await addSpace(ws, 'Nhân sự')
    await applyOps(session, [{ op: 'createType', key: 'de-nghi', name: 'Đề nghị' }])
    const type = await typeByKey(ws, 'de-nghi')
    await addCard(ws, type._id, hr)
    await addCard(ws, type._id, hr)

    const planned = await applyOps(session, [{ op: 'archiveType', type: 'de-nghi' }])
    expect(planned.risk).toBe('destructive')
    expect(planned.diff).toEqual([
      {
        text: 'Lưu trữ biểu mẫu *Đề nghị*: 2 hồ sơ được giữ lại nhưng không tạo thêm được',
        risk: 'destructive',
        affected: 2
      }
    ])
    expect(planned.inverse).toEqual([{ op: 'unarchiveType', type: 'de-nghi' }])

    const snapshot = await describeConfig(session)
    expect(snapshot.types.find((it) => it.key === 'de-nghi')?.isArchived).toBe(true)
    expect((await ws.client.findAll(card.class.Card, { _class: type._id })).length).toBe(2)
    expect((await typeByKey(ws, 'de-nghi')).removed).toBeUndefined()

    await applyOps(session, planned.inverse)
    expect((await describeConfig(session)).types.find((it) => it.key === 'de-nghi')?.isArchived).toBe(false)
  })

  it('frees the name but not the key of an archived type', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    await applyOps(session, [
      { op: 'createType', key: 'de-nghi', name: 'Đề nghị' },
      { op: 'archiveType', type: 'de-nghi' }
    ])
    const planned = await plan(session, [
      { op: 'createType', key: 'de-nghi-moi', name: 'Đề nghị' },
      { op: 'createType', key: 'de-nghi', name: 'Đề nghị khác' }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([[1, 'duplicate-key']])
  })

  it('blocks archiving a parent that still has active child types', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    await applyOps(session, [
      { op: 'createType', key: 'de-nghi', name: 'Đề nghị' },
      { op: 'createType', key: 'nghi-phep', name: 'Nghỉ phép', basedOn: 'de-nghi' }
    ])
    const planned = await plan(session, [{ op: 'archiveType', type: 'de-nghi' }])
    expect(planned.issues[0]).toMatchObject({ code: 'not-allowed' })
  })

  it('refuses to unarchive an active type', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    await applyOps(session, [{ op: 'createType', key: 'de-nghi', name: 'Đề nghị' }])
    const planned = await plan(session, [{ op: 'unarchiveType', type: 'de-nghi' }])
    expect(planned.issues[0]).toMatchObject({ code: 'not-allowed' })
  })

  it('refuses to unarchive a type whose name an active type took', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    await applyOps(session, [
      { op: 'createType', key: 'de-nghi', name: 'Đề nghị' },
      { op: 'archiveType', type: 'de-nghi' },
      { op: 'createType', key: 'de-nghi-moi', name: 'Đề nghị' }
    ])
    const planned = await plan(session, [{ op: 'unarchiveType', type: 'de-nghi' }])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([[0, 'duplicate-name']])
  })
})
