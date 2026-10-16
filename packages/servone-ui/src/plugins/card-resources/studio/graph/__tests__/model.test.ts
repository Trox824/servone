import type { AutomationInfo } from '@servone/config'
import { accountId, field, group, link, recordType, snapshotOf, space } from '../../__tests__/fixtures'
import { ADD_TYPE_ID, branchNodeId, companyGraph, formGraph, formNodeId, typeNodeId, type GraphNode } from '../model'

const NONE = new Set<string>()

function approvalRule (key: string): AutomationInfo {
  return {
    key,
    name: 'Duyệt',
    sentences: [],
    automation: {
      name: 'Duyệt',
      trigger: { kind: 'created' },
      actions: [{ kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } }],
      onApproved: [{ kind: 'createLinked', type: 'tam-ung', link: 'l1', title: 'Tạm ứng', values: [] }]
    }
  }
}

describe('companyGraph', () => {
  const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép', {
    fields: [field('so-ngay', 'Số ngày nghỉ', { kind: 'number' }), field('title', 'Tiêu đề', { kind: 'text' }, { isBuiltIn: true })],
    automations: [approvalRule('duyet')]
  })
  const staff = recordType('nhan-vien', 'Nhân viên')
  const advance = recordType('tam-ung', 'Tạm ứng')
  const hidden = recordType('thread', 'Thread', { isSystem: true })
  const archived = recordType('cu', 'Cũ', { isArchived: true })

  it('shows customer forms sorted by name and one add box', () => {
    const graph = companyGraph(snapshotOf({ types: [staff, leave, hidden, archived, advance] }), NONE)
    expect(graph.nodes.map((it) => it.label)).toEqual(['Đề nghị nghỉ phép', 'Nhân viên', 'Tạm ứng', 'Thêm biểu mẫu'])
    expect(graph.nodes.at(-1)?.target).toEqual({ kind: 'createType' })
    expect(graph.nodes[0].target).toEqual({ kind: 'openForm', typeKey: 'nghi-phep' })
  })

  it('counts questions without built-in ones and names who approves', () => {
    const graph = companyGraph(snapshotOf({ types: [leave] }), NONE)
    expect(graph.nodes[0].detail).toBe('1 câu hỏi · Người quản lý duyệt')
  })

  it('names the approver from a person question', () => {
    const byBoss = recordType('nghi-phep', 'Đề nghị nghỉ phép', {
      fields: [field('truong-phong', 'Trưởng phòng', { kind: 'person' })],
      automations: [
        {
          key: 'duyet',
          name: 'Duyệt',
          sentences: [],
          automation: {
            name: 'Duyệt',
            trigger: { kind: 'created' },
            actions: [{ kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } }]
          }
        }
      ]
    })
    expect(companyGraph(snapshotOf({ types: [byBoss] }), NONE).nodes[0].detail).toBe('1 câu hỏi · Trưởng phòng duyệt')
  })

  it('says how a form without an approval gets its process', () => {
    const handMade = recordType('hop-dong', 'Hợp đồng', { automations: [{ key: 'p1', name: 'Cũ', sentences: [], automation: null }] })
    const graph = companyGraph(snapshotOf({ types: [leave, advance, handMade, staff] }), NONE)
    expect(graph.nodes.map((it) => it.detail)).toEqual([
      '1 câu hỏi · Người quản lý duyệt',
      '0 câu hỏi · quy trình tạo trong Servone',
      '0 câu hỏi · không có quy trình',
      '0 câu hỏi · tự tạo, không cần duyệt',
      'Từ mẫu có sẵn, nhờ Trợ lý AI hoặc tạo trống'
    ])
  })

  it('counts questions inherited from the parent form', () => {
    const child = recordType('nghi-om', 'Nghỉ ốm', { basedOn: 'nghi-phep', fields: [field('giay', 'Giấy bác sĩ')] })
    const graph = companyGraph(snapshotOf({ types: [leave, child] }), NONE)
    expect(graph.nodes.find((it) => it.id === typeNodeId('nghi-om'))?.detail).toBe('2 câu hỏi · không có quy trình')
  })

  it('never draws people as boxes: person questions and spaces are chips', () => {
    const withPeople = recordType('nghi-phep', 'Đề nghị nghỉ phép', {
      spaces: ['s1', 's-cu'],
      fields: [field('truong-phong', 'Trưởng phòng', { kind: 'person' }), field('so-ngay', 'Số ngày nghỉ', { kind: 'number' })]
    })
    const graph = companyGraph(
      snapshotOf({ types: [withPeople], spaces: [space('s1', 'Nhân sự'), space('s-cu', 'Cũ', { isArchived: true })] }),
      NONE
    )
    expect(graph.nodes.map((it) => it.kind)).toEqual(['type', 'addType'])
    expect(graph.nodes[0].chips).toEqual([
      { kind: 'person', label: 'Trưởng phòng' },
      { kind: 'space', label: 'Nhân sự' }
    ])
  })

  it('marks forms with a change waiting for approval', () => {
    const graph = companyGraph(snapshotOf({ types: [leave, staff] }), new Set(['nhan-vien']))
    expect(graph.nodes.map((it) => it.isPending)).toEqual([false, true, false])
  })

  it('draws links between shown forms, labelled with the question name', () => {
    const graph = companyGraph(
      snapshotOf({
        types: [leave, staff, hidden],
        links: [link('gui', 'nghi-phep', 'nhan-vien', { fromName: 'Người gửi' }), link('x', 'nghi-phep', 'thread')]
      }),
      NONE
    )
    expect(graph.edges).toEqual([
      {
        id: 'link:gui',
        source: 'type:nghi-phep',
        target: 'type:nhan-vien',
        label: 'Người gửi',
        style: 'link',
        branch: undefined,
        outcome: undefined
      }
    ])
  })

  it('draws one dashed edge per rule that creates another form', () => {
    const twice = recordType('cong-tac', 'Công tác', {
      automations: [
        {
          ...approvalRule('duyet'),
          automation: {
            name: 'Duyệt',
            trigger: { kind: 'created' },
            actions: [],
            onApproved: [
              { kind: 'createLinked', type: 'tam-ung', link: 'l1', title: 'A', values: [] },
              { kind: 'createLinked', type: 'tam-ung', link: 'l1', title: 'B', values: [] }
            ]
          }
        }
      ]
    })
    const graph = companyGraph(snapshotOf({ types: [twice, advance] }), NONE)
    expect(graph.edges).toEqual([
      {
        id: 'rule:cong-tac:duyet:GraphCreatesOnApproved:tam-ung',
        source: 'type:cong-tac',
        target: 'type:tam-ung',
        label: 'khi được duyệt → tự tạo',
        style: 'rule',
        branch: undefined,
        outcome: undefined
      }
    ])
  })

  it('shows only a start box when there are no forms yet', () => {
    const graph = companyGraph(snapshotOf({ types: [hidden] }), NONE)
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0]).toMatchObject({ id: ADD_TYPE_ID, kind: 'addType', label: 'Bắt đầu: tạo biểu mẫu đầu tiên' })
  })
})

describe('formGraph', () => {
  const parent = recordType('de-nghi', 'Đề nghị', { fields: [field('ly-do', 'Lý do'), field('ngay', 'Ngày', { kind: 'date' })] })
  const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép', {
    basedOn: 'de-nghi',
    fields: [
      field('so-ngay', 'Số ngày nghỉ', { kind: 'number' }),
      field('title', 'Tiêu đề', { kind: 'text' }, { isBuiltIn: true }),
      field('ly-do', 'Lý do riêng'),
      field('phi', 'Phí', { kind: 'money', currency: 'VND' })
    ],
    access: [{ space: 's1', viewer: [], editor: [], manager: [] }],
    automations: [
      { key: 'duyet', name: 'Duyệt nghỉ', sentences: ['Khi *tạo mới*'], automation: null },
      {
        key: 'bao',
        name: 'Báo HR',
        sentences: ['Khi tạo mới'],
        automation: { name: 'Báo HR', trigger: { kind: 'created' }, actions: [] }
      },
      {
        key: 'xin',
        name: 'Xin nghỉ',
        sentences: [],
        automation: {
          name: 'Xin nghỉ',
          trigger: { kind: 'created' },
          actions: [
            { kind: 'setField', field: 'so-ngay', value: 1 },
            { kind: 'requestApproval', from: { kind: 'preset', preset: 'manager' } }
          ],
          onApproved: [{ kind: 'lockRecord' }],
          onRejected: [{ kind: 'createTodo', title: 'Sửa lại đề nghị', assignee: { kind: 'people', people: [accountId('u1')] } }]
        }
      }
    ]
  })
  const staff = recordType('nhan-vien', 'Nhân viên')
  const snapshot = snapshotOf({
    types: [parent, leave, staff],
    groups: [group('thu-viec', 'Thông tin thử việc', 'nghi-phep', [field('mentor', 'Người kèm', { kind: 'person' })])],
    links: [link('gui', 'nghi-phep', 'nhan-vien', { fromName: 'Người gửi' })],
    spaces: [space('s1', 'Nhân sự'), space('s2', 'Kế toán')]
  })

  function built (): NonNullable<ReturnType<typeof formGraph>> {
    const graph = formGraph(snapshot, 'nghi-phep', new Set(['nghi-phep']))
    if (graph === undefined) throw new Error('form expected')
    return graph
  }

  function labelsUnder (parentId: string): string[] {
    const graph = built()
    const children = new Set(graph.edges.filter((it) => it.source === parentId).map((it) => it.target))
    return graph.nodes.filter((it) => children.has(it.id)).map((it) => it.label)
  }

  it('puts the form at the root with four branches in a fixed order', () => {
    const graph = built()
    expect(graph.nodes[0]).toMatchObject({ id: formNodeId('nghi-phep'), kind: 'form', label: 'Đề nghị nghỉ phép', isPending: true })
    expect(labelsUnder(formNodeId('nghi-phep'))).toEqual(['Biểu mẫu', 'Quy trình', 'Liên quan tới', 'Ai được xem'])
  })

  it('lists own questions, then inherited ones, groups and an add box', () => {
    expect(labelsUnder(branchNodeId('questions'))).toEqual([
      'Số ngày nghỉ',
      'Lý do riêng',
      'Phí',
      'Ngày',
      'Thông tin thử việc',
      'Thêm câu hỏi'
    ])
    const graph = built()
    expect(graph.nodes.find((it) => it.id === 'q:so-ngay')).toMatchObject({
      kind: 'question',
      detail: 'Số',
      target: { kind: 'question', owner: 'nghi-phep', fieldKey: 'so-ngay' }
    })
    expect(graph.nodes.find((it) => it.id === 'q:ly-do')?.detail).toBe('Chữ ngắn')
    expect(graph.nodes.find((it) => it.id === 'q:phi')?.detail).toBe('Số')
    expect(graph.nodes.find((it) => it.id === 'iq:ngay')).toMatchObject({
      kind: 'inherited',
      detail: 'câu hỏi chung từ Đề nghị',
      target: { kind: 'openForm', typeKey: 'de-nghi' }
    })
    expect(graph.nodes.find((it) => it.id === 'add:questions')?.target).toEqual({ kind: 'question', owner: 'nghi-phep', fieldKey: undefined })
  })

  it('hangs group questions under their group, edited with the group as owner', () => {
    expect(labelsUnder('g:thu-viec')).toEqual(['Người kèm'])
    expect(built().nodes.find((it) => it.id === 'gq:thu-viec:mentor')).toMatchObject({
      detail: 'Người',
      target: { kind: 'question', owner: 'thu-viec', fieldKey: 'mentor' }
    })
  })

  it('starts each engine rule with its trigger and shows Huly processes as one read-only box', () => {
    expect(labelsUnder(branchNodeId('process'))).toEqual([
      'Duyệt nghỉ',
      'Khi tạo Đề nghị nghỉ phép',
      'Khi tạo Đề nghị nghỉ phép',
      'Thêm quy trình'
    ])
    const graph = built()
    expect(graph.nodes.find((it) => it.id === 'r:duyet')).toMatchObject({
      kind: 'hulyRule',
      detail: 'Tạo trong trình soạn quy trình của Servone',
      target: { kind: 'hulyProcess', processId: 'duyet' }
    })
    expect(graph.edges.filter((it) => it.source === 'r:duyet')).toEqual([])
    expect(graph.nodes.find((it) => it.id === 'r:bao')).toMatchObject({ kind: 'trigger', detail: 'Báo HR', state: undefined })
    expect(graph.nodes.find((it) => it.id === 'r:bao:then')).toMatchObject({
      kind: 'step',
      label: 'Rồi',
      lines: ['Không làm gì thêm'],
      state: 'Xong',
      target: { kind: 'rule', ruleKey: 'bao' }
    })
  })

  it('draws an approval with Duyệt and Từ chối paths and the states the engine uses', () => {
    const graph = built()
    const byId = (id: string): GraphNode | undefined => graph.nodes.find((it) => it.id === id)
    expect(byId('r:xin:then')).toMatchObject({ lines: ['Đặt Số ngày nghỉ = 1'], state: undefined })
    expect(byId('r:xin:approval')).toMatchObject({
      kind: 'approval',
      label: 'Gửi duyệt cho',
      detail: 'Người quản lý',
      state: 'Chờ duyệt',
      target: { kind: 'rule', ruleKey: 'xin' }
    })
    expect(byId('r:xin:approved')).toMatchObject({ lines: ['Khóa Đề nghị nghỉ phép, không sửa được nữa'], state: 'Xong' })
    expect(byId('r:xin:rejected')).toMatchObject({ lines: ['Giao việc "Sửa lại đề nghị" cho 1 người'], state: 'Chờ việc xong' })
    expect(
      graph.edges.filter((it) => it.id.startsWith('r:xin')).map((it) => [it.source, it.target, it.label, it.outcome])
    ).toEqual([
      ['r:xin', 'r:xin:then', '', undefined],
      ['r:xin:then', 'r:xin:approval', '', undefined],
      ['r:xin:approval', 'r:xin:approved', 'Duyệt', 'approved'],
      ['r:xin:approval', 'r:xin:rejected', 'Từ chối', 'rejected']
    ])
  })

  it('offers a first step when the form has no rules', () => {
    const bare = formGraph(snapshotOf({ types: [staff] }), 'nhan-vien', new Set())
    expect(bare?.nodes.find((it) => it.id === 'add:process')?.label).toBe('Thêm bước duyệt hoặc việc cần làm')
  })

  it('lists connections and spaces that grant access', () => {
    expect(labelsUnder(branchNodeId('links'))).toEqual(['Người gửi → Nhân viên', 'Kết nối với biểu mẫu khác'])
    expect(built().nodes.find((it) => it.id === 'l:gui')?.detail).toBe('chọn một')
    const withPeople = formGraph(
      snapshotOf({
        ...snapshot,
        types: [
          parent,
          { ...leave, access: [{ space: 's1', viewer: [], editor: [], manager: [] }, { space: 's2', viewer: [], editor: [], manager: [] }] },
          staff
        ]
      }),
      'nghi-phep',
      new Set()
    )
    expect(withPeople?.nodes.filter((it) => it.kind === 'access')).toEqual([])
    expect(labelsUnder(branchNodeId('access'))).toEqual(['Chọn ai được xem'])
  })

  it('shows a space with people as one access box', () => {
    const viewer = accountId('u1')
    const granted = formGraph(
      snapshotOf({ ...snapshot, types: [parent, { ...leave, access: [{ space: 's1', viewer: [viewer], editor: [], manager: [] }] }, staff] }),
      'nghi-phep',
      new Set()
    )
    expect(granted?.nodes.find((it) => it.id === 'a:s1')).toMatchObject({
      kind: 'access',
      label: 'Nhân sự',
      detail: 'xem 1 · sửa 0 · quản lý 0',
      target: { kind: 'access' }
    })
  })

  it('returns undefined for a missing, archived or system form', () => {
    expect(formGraph(snapshot, 'khong-co', new Set())).toBeUndefined()
    expect(formGraph(snapshotOf({ types: [recordType('a', 'A', { isArchived: true })] }), 'a', new Set())).toBeUndefined()
    expect(formGraph(snapshotOf({ types: [recordType('t', 'T', { isSystem: true })] }), 't', new Set())).toBeUndefined()
  })

  it('shows rules from every parent form read-only, linking to the form that owns them', () => {
    const root = recordType('ho-so', 'Hồ sơ', { automations: [approvalRule('duyet-chung')] })
    const request = recordType('de-nghi', 'Đề nghị', {
      basedOn: 'ho-so',
      automations: [{ key: 'bao', name: 'Báo HR', sentences: [], automation: null }]
    })
    const leave = recordType('nghi-phep', 'Đề nghị nghỉ phép', { basedOn: 'de-nghi' })
    const graph = formGraph(snapshotOf({ types: [root, request, leave] }), 'nghi-phep', NONE)
    const process = graph?.nodes.filter((it) => graph.edges.some((edge) => edge.source === branchNodeId('process') && edge.target === it.id))
    expect(process?.map((it) => [it.id, it.kind, it.label, it.detail])).toEqual([
      ['ir:de-nghi:bao', 'inherited', 'Báo HR', 'quy trình chung từ Đề nghị, sửa ở đó'],
      ['ir:ho-so:duyet-chung', 'inherited', 'Duyệt', 'quy trình chung từ Hồ sơ, sửa ở đó'],
      ['add:process', 'add', 'Thêm bước duyệt hoặc việc cần làm', '']
    ])
    expect(graph?.nodes.find((it) => it.id === 'ir:ho-so:duyet-chung')?.target).toEqual({ kind: 'openForm', typeKey: 'ho-so' })
    expect(graph?.edges.some((it) => it.source === 'ir:ho-so:duyet-chung')).toBe(false)
  })

  it('survives a parent chain that loops', () => {
    const a = recordType('a', 'A', { basedOn: 'b', fields: [field('x', 'X')] })
    const b = recordType('b', 'B', { basedOn: 'a', fields: [field('y', 'Y')] })
    const graph = formGraph(snapshotOf({ types: [a, b] }), 'a', new Set())
    expect(graph?.nodes.filter((it) => it.kind === 'inherited').map((it) => it.label)).toEqual(['Y'])
    expect(companyGraph(snapshotOf({ types: [a, b] }), new Set()).nodes.map((it) => it.detail)).toEqual([
      '2 câu hỏi · không có quy trình',
      '2 câu hỏi · không có quy trình',
      'Từ mẫu có sẵn, nhờ Trợ lý AI hoặc tạo trống'
    ])
  })
})
