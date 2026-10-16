import type { CardSpace, MasterTag } from '@hcengineering/card'
import { type Ref, TxFactory } from '@hcengineering/core'
import type { ConfigSession } from '../client'
import { toAccountUuid } from '../keys'
import type { AutomationSpec } from '../operations'
import type { StepContext } from '../registry'
import { loadState } from '../state'
import {
  addEmployee,
  addSpace,
  applyOps,
  createWorkspace,
  type MemoryWorkspace,
  sessionFor,
  type TestEmployee,
  typeByKey
} from './harness'

export interface LeaveFixture {
  ws: MemoryWorkspace
  session: ConfigSession
  space: Ref<CardSpace>
  type: MasterTag
  expense: MasterTag
  lan: TestEmployee
  minh: TestEmployee
}

export async function leaveFixture (): Promise<LeaveFixture> {
  const ws = createWorkspace()
  const session = sessionFor(ws)
  const space = await addSpace(ws, 'Nhân sự')
  await applyOps(session, [
    { op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép', spaces: [space] },
    {
      op: 'addField',
      type: 'nghi-phep',
      key: 'trang-thai',
      name: 'Trạng thái',
      kind: { kind: 'select', options: ['Nháp', 'Đã nộp', 'Đã duyệt', 'Từ chối'] }
    },
    { op: 'addField', type: 'nghi-phep', key: 'truong-phong', name: 'Trưởng phòng', kind: { kind: 'person' } },
    { op: 'addField', type: 'nghi-phep', key: 'ngay-bat-dau', name: 'Ngày bắt đầu', kind: { kind: 'date' } },
    { op: 'addField', type: 'nghi-phep', key: 'tam-ung', name: 'Tạm ứng', kind: { kind: 'money', currency: 'VND' } },
    { op: 'addField', type: 'nghi-phep', key: 'khan', name: 'Khẩn', kind: { kind: 'boolean' } },
    { op: 'createType', key: 'cong-tac-phi', name: 'Công tác phí', spaces: [space] },
    { op: 'addField', type: 'cong-tac-phi', key: 'so-tien', name: 'Số tiền', kind: { kind: 'money', currency: 'VND' } },
    {
      op: 'addLink',
      key: 'nghi-phep-cong-tac-phi',
      from: 'nghi-phep',
      to: 'cong-tac-phi',
      fromName: 'Công tác phí',
      toName: 'Đề nghị',
      fromMany: true,
      toMany: false
    }
  ])
  const lan = await addEmployee(ws, 'Lan')
  const minh = await addEmployee(ws, 'Minh')
  return { ws, session, space, type: await typeByKey(ws, 'nghi-phep'), expense: await typeByKey(ws, 'cong-tac-phi'), lan, minh }
}

export async function withManagers (fx: LeaveFixture): Promise<void> {
  await applyOps(fx.session, [
    { op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space: fx.space, isRestricted: true, manager: [fx.lan.account] }] } }
  ])
}

export async function stepContext (session: ConfigSession): Promise<StepContext> {
  return {
    state: await loadState(session.client),
    factory: new TxFactory(session.account.primarySocialId),
    client: session.client,
    account: session.account
  }
}

export const APPROVAL: AutomationSpec = {
  name: 'Duyệt nghỉ phép',
  trigger: { kind: 'created' },
  actions: [
    { kind: 'setField', field: 'trang-thai', value: 'Đã nộp' },
    { kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } }
  ],
  onApproved: [{ kind: 'setField', field: 'trang-thai', value: 'Đã duyệt' }, { kind: 'lockRecord' }],
  onRejected: [{ kind: 'setField', field: 'trang-thai', value: 'Từ chối' }]
}

export const REMINDER: AutomationSpec = {
  name: 'Nhắc bàn giao',
  trigger: { kind: 'date', field: 'ngay-bat-dau', offsetDays: -3 },
  actions: [
    { kind: 'lockField', fields: ['ngay-bat-dau', 'tam-ung'] },
    { kind: 'createTodo', title: 'Bàn giao công việc', assignee: { kind: 'people', people: [toAccountUuid('lan-uuid')] } }
  ]
}

export const ADVANCE: AutomationSpec = {
  name: 'Tạm ứng công tác',
  trigger: { kind: 'fieldChanged', field: 'khan', to: true },
  actions: [
    {
      kind: 'createLinked',
      type: 'cong-tac-phi',
      link: 'nghi-phep-cong-tac-phi',
      title: 'Tạm ứng',
      values: [{ field: 'so-tien', value: 2000000 }]
    },
    { kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } }
  ]
}

export const SUBMITTED: AutomationSpec = {
  name: 'Đánh dấu đã nộp',
  trigger: { kind: 'created' },
  actions: [{ kind: 'setField', field: 'trang-thai', value: 'Đã nộp' }]
}

export async function withAccountant (fx: LeaveFixture): Promise<void> {
  await applyOps(fx.session, [{ op: 'addField', type: 'cong-tac-phi', key: 'ke-toan', name: 'Kế toán', kind: { kind: 'person' } }])
}

export const LINKED: AutomationSpec = {
  name: 'Duyệt qua công tác phí',
  trigger: { kind: 'created' },
  actions: [{ kind: 'requestApproval', from: { kind: 'linked', link: 'nghi-phep-cong-tac-phi', field: 'ke-toan' } }],
  onRejected: [{ kind: 'createTodo', title: 'Sửa lại đề nghị', assignee: { kind: 'initiator' } }]
}
