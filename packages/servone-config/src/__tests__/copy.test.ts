import type { ConfigSession } from '../client'
import { describe as describeConfig } from '../describe'
import { plan } from '../plan'
import type { RecordTypeInfo } from '../types'
import { addSpace, applyOps, createWorkspace, sessionFor } from './harness'

async function fixture (): Promise<{ session: ConfigSession, space: string }> {
  const ws = createWorkspace()
  const session = sessionFor(ws)
  const space = await addSpace(ws, 'Nhân sự')
  await applyOps(session, [
    { op: 'createType', key: 'nhan-vien', name: 'Nhân viên', spaces: [space] },
    { op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép', spaces: [space] },
    { op: 'addField', type: 'nghi-phep', key: 'ly-do', name: 'Lý do', kind: { kind: 'text' }, required: true },
    { op: 'addField', type: 'nghi-phep', key: 'loai', name: 'Loại', kind: { kind: 'select', options: ['Phép năm', 'Không lương'] } },
    { op: 'addField', type: 'nghi-phep', key: 'ma', name: 'Mã', kind: { kind: 'autoNumber', prefix: 'NP' } },
    {
      op: 'addLink',
      key: 'np-nv',
      from: 'nghi-phep',
      to: 'nhan-vien',
      fromName: 'Người xin',
      toName: 'Đơn nghỉ phép',
      fromMany: false,
      toMany: false
    }
  ])
  return { session, space }
}

async function typeInfo (session: ConfigSession, key: string): Promise<RecordTypeInfo | undefined> {
  return (await describeConfig(session)).types.find((it) => it.key === key)
}

const copyOp = { op: 'copyType', from: 'nghi-phep', key: 'nghi-phep-2', name: 'Đề nghị nghỉ phép 2' } as const

describe('copyType', () => {
  it('copies fields, dropdown options, links and spaces', async () => {
    const { session, space } = await fixture()
    const planned = await applyOps(session, [copyOp])
    expect(planned.diff.map((it) => it.text)).toEqual([
      'Sao chép *Đề nghị nghỉ phép* thành *Đề nghị nghỉ phép 2*: 2 trường, 1 liên kết',
      'Không sao chép trường *Mã* (Mã tự tăng); hãy thêm lại nếu cần',
      'Hiển thị, quyền và tự động hóa không được sao chép'
    ])
    const copy = await typeInfo(session, 'nghi-phep-2')
    expect(copy?.spaces).toEqual([space])
    expect(copy?.fields.map((it) => it.key).sort()).toEqual(['loai', 'ly-do'])
    expect(copy?.fields.find((it) => it.key === 'ly-do')?.isRequired).toBe(true)
    expect(copy?.fields.find((it) => it.key === 'loai')?.kind).toEqual({ kind: 'select', options: ['Phép năm', 'Không lương'] })
    const link = (await describeConfig(session)).links.find((it) => it.key === 'nghi-phep-2.np-nv')
    expect(link).toMatchObject({ from: 'nghi-phep-2', to: 'nhan-vien', fromName: 'Người xin', toName: 'Đơn nghỉ phép' })
  })

  it('gives the copy its own option list', async () => {
    const { session } = await fixture()
    await applyOps(session, [copyOp])
    await applyOps(session, [{ op: 'setOptions', type: 'nghi-phep-2', field: 'loai', options: [{ add: 'Ốm đau' }] }])
    const source = await typeInfo(session, 'nghi-phep')
    expect(source?.fields.find((it) => it.key === 'loai')?.kind).toEqual({ kind: 'select', options: ['Phép năm', 'Không lương'] })
  })

  it('undoes by removing copied links and archiving the copy', async () => {
    const { session } = await fixture()
    const planned = await applyOps(session, [copyOp])
    expect(planned.inverse).toEqual([
      { op: 'removeLink', link: 'nghi-phep-2.np-nv' },
      { op: 'archiveType', type: 'nghi-phep-2' }
    ])
    await applyOps(session, planned.inverse)
    expect((await typeInfo(session, 'nghi-phep-2'))?.isArchived).toBe(true)
    expect((await describeConfig(session)).links.some((it) => it.key === 'nghi-phep-2.np-nv')).toBe(false)
  })

  it('refuses a taken key or name', async () => {
    const { session } = await fixture()
    const planned = await plan(session, [{ op: 'copyType', from: 'nghi-phep', key: 'nhan-vien', name: 'Nhân viên' }])
    expect(planned.issues.map((it) => it.code)).toEqual(['duplicate-key', 'duplicate-name'])
  })
})
