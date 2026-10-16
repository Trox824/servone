import { AccountRole } from '@hcengineering/core'
import { describe as describeConfig } from '../describe'
import { parseOperations, parseOperationsJson, plan } from '../plan'
import { sendTxes } from '../send'
import { addSpace, applyOps, createWorkspace, sessionFor } from './harness'

describe('createType', () => {
  it('creates a type in the chosen spaces', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const hr = await addSpace(ws, 'Nhân sự')
    await addSpace(ws, 'Kinh doanh')
    const planned = await plan(session, [
      { op: 'createType', key: 'de-nghi-nghi-phep', name: 'Đề nghị nghỉ phép', spaces: ['Nhân sự'] }
    ])
    expect(planned.issues).toEqual([])
    expect(planned.risk).toBe('safe')
    expect(planned.diff.map((it) => it.text)).toEqual(['Tạo biểu mẫu *Đề nghị nghỉ phép*, hiện trong: Nhân sự'])
    expect(planned.inverse).toEqual([{ op: 'archiveType', type: 'de-nghi-nghi-phep' }])
    expect(planned.summary).toBe('Tạo biểu mẫu Đề nghị nghỉ phép, hiện trong: Nhân sự')
    expect(planned.typeKeys).toEqual(['de-nghi-nghi-phep'])

    await sendTxes(session, planned.txes)
    const type = (await describeConfig(session)).types.find((it) => it.key === 'de-nghi-nghi-phep')
    expect(type).toMatchObject({ name: 'Đề nghị nghỉ phép', isSystem: false, isArchived: false, spaces: [hr] })
  })

  it('defaults to every active card space', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const hr = await addSpace(ws, 'Nhân sự')
    const sales = await addSpace(ws, 'Kinh doanh')
    await applyOps(session, [{ op: 'createType', key: 'tai-san', name: 'Tài sản' }])
    const type = (await describeConfig(session)).types.find((it) => it.key === 'tai-san')
    expect([...(type?.spaces ?? [])].sort()).toEqual([hr, sales].sort())
  })

  it('reports bad keys, taken keys and duplicate names with their op index', async () => {
    const ws = createWorkspace()
    const planned = await plan(sessionFor(ws), [
      { op: 'createType', key: 'Bad Key', name: 'A' },
      { op: 'createType', key: 'hop-dong', name: 'Hợp đồng' },
      { op: 'createType', key: 'hop-dong', name: 'Hợp đồng khác' },
      { op: 'createType', key: 'hop-dong-2', name: ' hợp ĐỒNG ' }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [0, 'invalid-input'],
      [2, 'duplicate-key'],
      [3, 'duplicate-name']
    ])
    expect(planned.txes).toEqual([])
  })

  it('refuses non-maintainers', async () => {
    const ws = createWorkspace()
    const planned = await plan(sessionFor(ws, 'nhan-vien', AccountRole.User), [{ op: 'createType', key: 'x', name: 'X' }])
    expect(planned.issues[0]).toMatchObject({ opIndex: -1, code: 'forbidden' })
  })

  it('resolves keys created earlier in the same plan', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    await applyOps(session, [
      { op: 'createType', key: 'khach-hang', name: 'Khách hàng' },
      { op: 'updateType', type: 'khach-hang', name: 'Khách hàng doanh nghiệp' }
    ])
    const type = (await describeConfig(session)).types.find((it) => it.key === 'khach-hang')
    expect(type?.name).toBe('Khách hàng doanh nghiệp')
  })
})

describe('updateType', () => {
  it('renames, recolours and moves a type; the inverse restores it', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const sales = await addSpace(ws, 'Kinh doanh')
    const legal = await addSpace(ws, 'Pháp chế')
    await applyOps(session, [{ op: 'createType', key: 'hop-dong', name: 'Hợp đồng', spaces: ['Kinh doanh'] }])

    const planned = await applyOps(session, [
      { op: 'updateType', type: 'hop-dong', name: 'Hợp đồng dịch vụ', color: 3, spaces: [legal] }
    ])
    expect(planned.diff.map((it) => it.text)).toEqual([
      'Đổi tên biểu mẫu *Hợp đồng* thành *Hợp đồng dịch vụ*',
      'Đổi màu của *Hợp đồng*',
      '*Hợp đồng* hiện trong: Pháp chế'
    ])
    expect(planned.inverse).toEqual([
      { op: 'updateType', type: 'hop-dong', name: 'Hợp đồng', color: expect.any(Number), spaces: [sales] }
    ])
    let type = (await describeConfig(session)).types.find((it) => it.key === 'hop-dong')
    expect(type).toMatchObject({ name: 'Hợp đồng dịch vụ', spaces: [legal] })

    await applyOps(session, planned.inverse)
    type = (await describeConfig(session)).types.find((it) => it.key === 'hop-dong')
    expect(type).toMatchObject({ name: 'Hợp đồng', spaces: [sales] })
  })

  it('refuses unknown types, empty updates and bad colours', async () => {
    const ws = createWorkspace()
    const planned = await plan(sessionFor(ws), [
      { op: 'updateType', type: 'khong-co', name: 'X' },
      { op: 'createType', key: 'x', name: 'X' },
      { op: 'updateType', type: 'x' },
      { op: 'updateType', type: 'x', color: 99 }
    ])
    expect(planned.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [0, 'not-found'],
      [2, 'invalid-input'],
      [3, 'invalid-input']
    ])
  })
})

describe('parseOperations', () => {
  it('parses valid operations', () => {
    expect(parseOperations([{ op: 'createType', key: 'x', name: 'X', spaces: ['A'] }])).toEqual({
      ops: [{ op: 'createType', key: 'x', name: 'X', spaces: ['A'] }],
      issues: []
    })
  })

  it('reports unknown kinds, wrong field types and non-objects', () => {
    const parsed = parseOperations([{ op: 'khong-co' }, { op: 'createType', key: 'x', name: 1 }, 'text'])
    expect(parsed.ops).toEqual([])
    expect(parsed.issues.map((it) => [it.opIndex, it.code])).toEqual([
      [0, 'unknown-operation'],
      [1, 'invalid-input'],
      [2, 'invalid-input']
    ])
    expect(parsed.issues[1].message).toBe('name: cần chuỗi')
  })

  it('rejects malformed JSON', () => {
    expect(parseOperationsJson('[{').issues[0].code).toBe('invalid-input')
  })
})
