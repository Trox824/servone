import contact, { type Employee, type Person, type SocialIdentity } from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type Class,
  type Doc,
  type DocumentQuery,
  type PersonId,
  type Ref,
  type Space,
  toFindResult,
  TxFactory
} from '@hcengineering/core'
import { createMcpHandler } from '@modelcontextprotocol/server'
import type * as ConfigModule from '@servone/config'
import {
  applyChange,
  type AutomationSpec,
  ConfigError,
  type ConfigSnapshot,
  describe as describeConfig,
  type DiffLine,
  listChanges,
  parseChangeId,
  plan,
  saveDraft,
  undoChange
} from '@servone/config'
import { z } from 'zod'

import { buildMcpServer } from '../mcp'
import { MAX_TOOL_TEXT, ToolInputError, type AnyTool } from '../tool'
import { studioTools } from '../tools/studio'
import type { WorkspaceSession } from '../types'
import { changeRecord, configOf, draftPlan, fakeSession, ME_ACCOUNT, ME_PERSON, ME_SOCIAL } from './fixtures'

// Session-bound core calls are faked; parseOperations, parseChangeId and ConfigError stay real.
jest.mock('@servone/config', () => ({
  ...jest.requireActual<typeof ConfigModule>('@servone/config'),
  describe: jest.fn(),
  plan: jest.fn(),
  saveDraft: jest.fn(),
  applyChange: jest.fn(),
  undoChange: jest.fn(),
  listChanges: jest.fn()
}))

type EmployeeRow = Doc & Pick<Employee, 'name' | 'personUuid'>
type PersonRow = Doc & Pick<Person, 'name'>
type SocialIdentityRow = Doc & Pick<SocialIdentity, 'attachedTo'>

const AN_ACCOUNT = 'acc-an' as AccountUuid
const AN_PERSON = 'person-an' as Ref<Person>
const AN_SOCIAL = 'social-an' as PersonId
const BASE = { space: core.space.Space, modifiedOn: 0, modifiedBy: ME_SOCIAL }

const SNAPSHOT: ConfigSnapshot = {
  version: 'v1',
  types: [
    {
      key: 'nghi-phep',
      name: 'Đề nghị nghỉ phép',
      isSystem: false,
      isArchived: false,
      spaces: ['sp-hr'],
      fields: [
        { key: 'ly-do', name: 'Lý do', kind: { kind: 'text' }, isRequired: true, isBuiltIn: false },
        { key: 'loai', name: 'Loại', kind: { kind: 'select', options: ['Phép năm', 'Ốm'] }, isRequired: false, isBuiltIn: false },
        { key: 'so-ngay', name: 'Số ngày', kind: { kind: 'number', min: 0, isInteger: true }, isRequired: false, isBuiltIn: false },
        { key: 'tam-ung', name: 'Tạm ứng', kind: { kind: 'money', currency: 'VND' }, isRequired: false, isBuiltIn: false }
      ],
      access: [{ space: 'sp-hr', viewer: [AN_ACCOUNT], editor: [], manager: [ME_ACCOUNT] }],
      automations: []
    },
    {
      key: 'file',
      name: 'File',
      isSystem: true,
      isArchived: false,
      spaces: [],
      fields: [{ key: 'title', name: 'Title', kind: { kind: 'text' }, isRequired: true, isBuiltIn: true }],
      access: [],
      automations: []
    }
  ],
  links: [
    { key: 'kh-hd', from: 'khach-hang', to: 'hop-dong', fromName: 'Hợp đồng', toName: 'Khách hàng', fromMany: true, toMany: false }
  ],
  groups: [
    {
      key: 'thu-viec',
      name: 'Thông tin thử việc',
      type: 'nhan-vien',
      fields: [{ key: 'ngay-het-han', name: 'Ngày hết hạn', kind: { kind: 'date' }, isRequired: false, isBuiltIn: false }]
    }
  ],
  spaces: [
    { id: 'sp-hr', name: 'Nhân sự', isRestricted: false, isArchived: false },
    { id: 'sp-bgd', name: 'Ban giám đốc', isRestricted: true, isArchived: false }
  ]
}

function matches (row: Doc, query: DocumentQuery<Doc>): boolean {
  const fields = new Map(Object.entries(row))
  return Object.entries(query).every(([key, cond]) => {
    if (cond !== null && typeof cond === 'object' && '$in' in cond) return cond.$in.includes(fields.get(key))
    if (cond !== null && typeof cond === 'object') return true
    return fields.get(key) === cond
  })
}

function setup (): WorkspaceSession {
  const session = fakeSession()
  const employees: EmployeeRow[] = [
    { ...BASE, _id: ME_PERSON, _class: contact.class.Person, name: 'Nguyen,Hung', personUuid: ME_ACCOUNT },
    { ...BASE, _id: AN_PERSON, _class: contact.class.Person, name: 'Tran,An', personUuid: AN_ACCOUNT }
  ]
  const persons: PersonRow[] = [
    { ...BASE, _id: ME_PERSON, _class: contact.class.Person, name: 'Nguyen,Hung' },
    { ...BASE, _id: AN_PERSON, _class: contact.class.Person, name: 'Tran,An' }
  ]
  const identities: SocialIdentityRow[] = [
    { ...BASE, _id: ME_SOCIAL as SocialIdentity['_id'], _class: contact.class.SocialIdentity, attachedTo: ME_PERSON },
    { ...BASE, _id: AN_SOCIAL as SocialIdentity['_id'], _class: contact.class.SocialIdentity, attachedTo: AN_PERSON }
  ]
  const tables = new Map<Ref<Class<Doc>>, Doc[]>([
    [contact.mixin.Employee, employees],
    [contact.class.Person, persons],
    [contact.class.SocialIdentity, identities]
  ])
  session.client.findAll = jest.fn().mockImplementation(async (cls: Ref<Class<Doc>>, query: DocumentQuery<Doc>) =>
    toFindResult((tables.get(cls) ?? []).filter((row) => matches(row, query)))
  )
  return session
}

function tool (name: string): AnyTool {
  const found = studioTools.find((it) => it.name === name)
  if (found === undefined) throw new Error(`no tool ${name}`)
  return found
}

afterEach(() => {
  jest.resetAllMocks()
})

describe('describe_record_types', () => {
  it('prints types, fields, access, links, groups and spaces in concept words', async () => {
    const session = setup()
    jest.mocked(describeConfig).mockResolvedValue(SNAPSHOT)
    const out = await tool('describe_record_types').run(session, {})
    expect(out).toContain('nghi-phep "Đề nghị nghỉ phép"')
    expect(out).toContain('based on: nothing | shown in: "Nhân sự"')
    expect(out).toContain('- ly-do "Lý do": text, required')
    expect(out).toContain('- loai "Loại": dropdown [Phép năm, Ốm]')
    expect(out).toContain('- so-ngay "Số ngày": number (whole, min 0)')
    expect(out).toContain('- tam-ung "Tạm ứng": money VND')
    expect(out).toContain('access in "Nhân sự": viewers An Tran <acc-an>; editors none; managers Hung Nguyen <acc-me>')
    expect(out).toContain('file "File" (system type: fields can be added and renamed, the type cannot be archived)')
    expect(out).toContain('- title "Title": text, required, built-in')
    expect(out).toContain(
      '- kh-hd: each khach-hang has many hop-dong (field "Hợp đồng"); each hop-dong has one khach-hang (field "Khách hàng")'
    )
    expect(out).toContain('- thu-viec "Thông tin thử việc" on nhan-vien:')
    expect(out).toContain('- ngay-het-han "Ngày hết hạn": date')
    expect(out).toContain('Spaces: "Nhân sự" (sp-hr), "Ban giám đốc" (sp-bgd, restricted)')
    expect(out).not.toMatch(/MasterTag|Attribute|Association|mixin|Enum/)
  })

  it('hands the core the caller session, which can write', async () => {
    const session = setup()
    jest.mocked(describeConfig).mockResolvedValue(SNAPSHOT)
    await tool('describe_record_types').run(session, { type: 'nghi-phep' })
    expect(describeConfig).toHaveBeenCalledWith(configOf(session), { type: 'nghi-phep' })
    expect(typeof jest.mocked(describeConfig).mock.calls[0][0].client.tx).toBe('function')
  })

  it('names the known keys when the filter matches nothing', async () => {
    const session = setup()
    jest
      .mocked(describeConfig)
      .mockResolvedValueOnce({ ...SNAPSHOT, types: [], links: [], groups: [] })
      .mockResolvedValueOnce(SNAPSHOT)
    const run = tool('describe_record_types').run(session, { type: 'cong-tac' })
    await expect(run).rejects.toBeInstanceOf(ToolInputError)
    await expect(run).rejects.toThrow('Record type "cong-tac" not found. Known: nghi-phep, file')
  })

  it('caps a very large workspace', async () => {
    const session = setup()
    const many = Array.from({ length: 3000 }, (_, i) => ({ ...SNAPSHOT.types[0], key: `loai-${i}`, access: [] }))
    jest.mocked(describeConfig).mockResolvedValue({ ...SNAPSHOT, types: many })
    const out = await tool('describe_record_types').run(session, {})
    expect(out.length).toBeLessThan(MAX_TOOL_TEXT + 200)
    expect(out).toContain('[truncated:')
  })

  it('prints automations as sentences with the rule to resend', async () => {
    const session = setup()
    const rule: AutomationSpec = {
      name: 'Duyệt nghỉ phép',
      trigger: { kind: 'created' },
      actions: [{ kind: 'requestApproval', from: { kind: 'field', field: 'truong-phong' } }],
      onApproved: [{ kind: 'setField', field: 'loai', value: 'Phép năm' }]
    }
    jest.mocked(describeConfig).mockResolvedValue({
      ...SNAPSHOT,
      types: [
        {
          ...SNAPSHOT.types[0],
          automations: [
            {
              key: 'duyet',
              name: 'Duyệt nghỉ phép',
              automation: rule,
              sentences: [
                'Khi tạo hồ sơ thì gửi duyệt cho người ở trường *Trưởng phòng* (tất cả phải duyệt)',
                'Khi được duyệt thì đặt *Loại* = "Phép năm"'
              ]
            },
            { key: 'proc-1', name: 'Quy trình cũ', automation: null, sentences: ['Khóa hồ sơ khi xong'] }
          ]
        }
      ]
    })
    const out = await tool('describe_record_types').run(session, {})
    expect(out).toContain('  automations:')
    expect(out).toContain(
      '    - duyet "Duyệt nghỉ phép": Khi tạo hồ sơ thì gửi duyệt cho người ở trường *Trưởng phòng* (tất cả phải duyệt)'
    )
    expect(out).toContain('      Khi được duyệt thì đặt *Loại* = "Phép năm"')
    expect(out).toContain(`      rule: ${JSON.stringify(rule)}`)
    expect(out).toContain('    - proc-1 "Quy trình cũ" (made outside Studio, read-only)\n      Khóa hồ sơ khi xong')
    expect(out).not.toMatch(/Process|Transition|Trigger/)
  })

  it('lists a parent type rule on the child, to edit on the parent', async () => {
    const session = setup()
    const parentRule = { key: 'duyet', name: 'Duyệt chung', automation: null, sentences: ['Khi tạo hồ sơ thì gửi duyệt'] }
    const all: ConfigSnapshot = {
      ...SNAPSHOT,
      types: [
        { ...SNAPSHOT.types[0], key: 'goc', name: 'Gốc', automations: [parentRule] },
        { ...SNAPSHOT.types[0], key: 'con', name: 'Con', basedOn: 'goc', automations: [] }
      ]
    }
    jest.mocked(describeConfig).mockImplementation(async (_, options) => ({ ...all, types: all.types.filter((it) => options?.type === undefined || it.key === options.type) }))
    const out = await tool('describe_record_types').run(session, { type: 'con' })
    expect(out).toContain('  inherited automations (also run on this type):')
    expect(out).toContain('    - duyet "Duyệt chung" (inherited from goc, edit it there): Khi tạo hồ sơ thì gửi duyệt')
  })

  it('prints a people line when a rule targets specific accounts', async () => {
    const session = setup()
    const rule: AutomationSpec = {
      name: 'Duyệt đặc biệt',
      trigger: { kind: 'created' },
      actions: [{ kind: 'requestApproval', from: { kind: 'people', people: [AN_ACCOUNT] } }]
    }
    jest.mocked(describeConfig).mockResolvedValue({
      ...SNAPSHOT,
      types: [
        {
          ...SNAPSHOT.types[0],
          automations: [
            {
              key: 'duyet-2',
              name: 'Duyệt đặc biệt',
              automation: rule,
              sentences: ['Khi tạo hồ sơ thì gửi duyệt cho An Tran (tất cả phải duyệt)']
            }
          ]
        }
      ]
    })
    const out = await tool('describe_record_types').run(session, {})
    expect(out).toContain('      people: An Tran <acc-an>')
  })
})

const REMOVE_LINE: DiffLine = {
  text: 'Xóa trường *Ghi chú* khỏi *Đề nghị nghỉ phép*: 42 hồ sơ đang có giá trị ở trường này',
  risk: 'destructive',
  affected: 42
}

const toolListReply = z.object({
  result: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        inputSchema: z.looseObject({ type: z.literal('object') }),
        annotations: z.object({ readOnlyHint: z.boolean().optional(), destructiveHint: z.boolean().optional() })
      })
    )
  })
})

const operationsSchema = z.object({
  properties: z.object({ operations: z.object({ type: z.literal('array') }) })
})

async function listTools (): Promise<z.infer<typeof toolListReply>['result']['tools']> {
  const handler = createMcpHandler(() => buildMcpServer(fakeSession(), studioTools, jest.fn()))
  const response = await handler.fetch(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    })
  )
  const body = await response.text()
  // The handler may answer with a JSON body or a single-event SSE stream.
  const dataLine = body.split('\n').find((line) => line.startsWith('data:'))
  return toolListReply.parse(JSON.parse(dataLine === undefined ? body : dataLine.slice('data:'.length))).result.tools
}

describe('plan_config_change', () => {
  it('parses operations with the config core and saves a draft', async () => {
    const session = setup()
    const draft = draftPlan({ diff: [{ text: 'Tạo loại hồ sơ *Đề nghị công tác*', risk: 'safe' }] })
    jest.mocked(plan).mockResolvedValue(draft)
    jest.mocked(saveDraft).mockResolvedValue(changeRecord())
    const out = await tool('plan_config_change').run(session, {
      operations: [{ op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác' }]
    })
    const config = configOf(session)
    expect(plan).toHaveBeenCalledWith(config, [
      expect.objectContaining({ op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác' })
    ])
    expect(saveDraft).toHaveBeenCalledWith(config, draft)
    expect(out).toContain('Drafted change change-1 (not applied yet).')
    expect(out).toContain('Risk: safe')
    expect(out).toContain('- [safe] Tạo loại hồ sơ *Đề nghị công tác*')
    expect(out).toContain('Next: call apply_config_change with changeId "change-1".')
  })

  it('refuses operations the core cannot read, before planning', async () => {
    const session = setup()
    const run = tool('plan_config_change').run(session, {
      operations: [{ op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác' }, { op: 'explode' }]
    })
    await expect(run).rejects.toBeInstanceOf(ToolInputError)
    await expect(run).rejects.toThrow(/operation 2: .*explode/)
    expect(plan).not.toHaveBeenCalled()
  })

  it('returns planning problems and saves nothing', async () => {
    const session = setup()
    jest.mocked(plan).mockResolvedValue(
      draftPlan({
        issues: [
          { opIndex: 0, code: 'duplicate-key', message: 'Khóa cong-tac đã được dùng' },
          { opIndex: -1, code: 'forbidden', message: 'Chỉ quản trị viên (Maintainer trở lên) được đổi cấu hình' }
        ]
      })
    )
    const run = tool('plan_config_change').run(session, {
      operations: [{ op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác' }]
    })
    await expect(run).rejects.toBeInstanceOf(ToolInputError)
    await expect(run).rejects.toThrow(
      'The change cannot be made; nothing was saved.\n' +
        '- operation 1: Khóa cong-tac đã được dùng\n' +
        '- whole change: Chỉ quản trị viên (Maintainer trở lên) được đổi cấu hình\n' +
        'Only workspace maintainers can change record types.'
    )
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('adds no maintainer note when no issue is about permission', async () => {
    const session = setup()
    jest.mocked(plan).mockResolvedValue(
      draftPlan({ issues: [{ opIndex: 0, code: 'duplicate-key', message: 'Khóa cong-tac đã được dùng' }] })
    )
    const run = tool('plan_config_change').run(session, {
      operations: [{ op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác' }]
    })
    await expect(run).rejects.toThrow('The change cannot be made; nothing was saved.\n- operation 1: Khóa cong-tac đã được dùng')
    await expect(run).rejects.not.toThrow('maintainers')
  })

  it('asks for confirmation on destructive drafts, with record counts', async () => {
    const session = setup()
    jest.mocked(plan).mockResolvedValue(draftPlan({ risk: 'destructive', diff: [REMOVE_LINE] }))
    jest.mocked(saveDraft).mockResolvedValue(changeRecord({ risk: 'destructive', diff: [REMOVE_LINE] }))
    const out = await tool('plan_config_change').run(session, {
      operations: [{ op: 'removeField', type: 'nghi-phep', field: 'ghi-chu' }]
    })
    expect(out).toContain('Risk: destructive')
    expect(out).toContain(`- [destructive] ${REMOVE_LINE.text} [42 records]`)
    expect(out).toContain('if they agree, call apply_config_change with changeId "change-1" and confirm: true.')
  })

  it('says sensitive drafts wait for another maintainer', async () => {
    const session = setup()
    jest.mocked(plan).mockResolvedValue(draftPlan({ risk: 'sensitive' }))
    jest.mocked(saveDraft).mockResolvedValue(
      changeRecord({ risk: 'sensitive', diff: [{ text: 'Đổi quyền *Đề nghị nghỉ phép*', risk: 'sensitive' }] })
    )
    const out = await tool('plan_config_change').run(session, {
      operations: [{ op: 'setAccess', type: 'nghi-phep', access: { spaces: [{ space: 'Nhân sự', viewer: ['acc-an'] }] } }]
    })
    expect(out).toContain('Risk: sensitive')
    expect(out).toContain('waits as pending until another workspace maintainer approves it')
  })

  it('asks for confirmation when a sensitive draft also removes data', async () => {
    const session = setup()
    const diff: DiffLine[] = [{ text: 'Đổi quyền *Đề nghị nghỉ phép*', risk: 'sensitive' }, REMOVE_LINE]
    jest.mocked(plan).mockResolvedValue(draftPlan({ risk: 'sensitive', diff }))
    jest.mocked(saveDraft).mockResolvedValue(changeRecord({ risk: 'sensitive', diff }))
    const out = await tool('plan_config_change').run(session, {
      operations: [{ op: 'removeField', type: 'nghi-phep', field: 'ghi-chu' }]
    })
    expect(out).toContain('if they agree, call apply_config_change with changeId "change-1" and confirm: true.')
    expect(out).toContain('waits as pending until another workspace maintainer approves it')
  })

  it('maps a refused save to a tool input error', async () => {
    const session = setup()
    jest.mocked(plan).mockResolvedValue(draftPlan())
    jest.mocked(saveDraft).mockRejectedValue(new ConfigError('forbidden', 'Chỉ quản trị viên (Maintainer trở lên) được đổi cấu hình'))
    const run = tool('plan_config_change').run(session, {
      operations: [{ op: 'createType', key: 'cong-tac', name: 'Đề nghị công tác' }]
    })
    await expect(run).rejects.toBeInstanceOf(ToolInputError)
    await expect(run).rejects.toThrow(
      'Chỉ quản trị viên (Maintainer trở lên) được đổi cấu hình. Only workspace maintainers can change record types.'
    )
  })

  it.each(['plan_config_change', 'apply_config_change', 'undo_config_change'])('%s says it is for maintainers', (name) => {
    expect(tool(name).description).toContain('Workspace maintainers only')
  })

  it('publishes the operations schema over MCP', async () => {
    const tools = await listTools()
    const planTool = tools.find((it) => it.name === 'plan_config_change')
    expect(planTool?.annotations.readOnlyHint).toBe(true)
    expect(operationsSchema.safeParse(planTool?.inputSchema).success).toBe(true)
  })
})

describe('apply_config_change', () => {
  it('applies by id and passes confirm as isConfirmed', async () => {
    const session = setup()
    jest.mocked(applyChange).mockResolvedValue({ kind: 'applied', change: changeRecord({ status: 'applied' }) })
    const out = await tool('apply_config_change').run(session, { changeId: ' change-1 ', confirm: true })
    expect(applyChange).toHaveBeenCalledWith(configOf(session), 'change-1', { isConfirmed: true })
    expect(out).toContain('Applied change change-1.')
    expect(out).toContain('- [safe] Tạo loại hồ sơ *Đề nghị công tác*')
    expect(out).toContain('To revert it, call undo_config_change with changeId "change-1".')
  })

  it('writes nothing without confirm and returns the counts', async () => {
    const session = setup()
    jest.mocked(applyChange).mockResolvedValue({
      kind: 'needsConfirm',
      change: changeRecord({ risk: 'destructive', diff: [REMOVE_LINE] })
    })
    const out = await tool('apply_config_change').run(session, { changeId: 'change-1' })
    expect(applyChange).toHaveBeenCalledWith(expect.anything(), 'change-1', { isConfirmed: false })
    expect(out).toContain('Not applied yet: change change-1 hides or removes data.')
    expect(out).toContain('[42 records]')
    expect(out).toContain('If they agree, call apply_config_change with changeId "change-1" and confirm: true.')
  })

  it('reports pending approval and who approves', async () => {
    const session = setup()
    jest.mocked(applyChange).mockResolvedValue({
      kind: 'pendingApproval',
      change: changeRecord({ status: 'pending', risk: 'sensitive' })
    })
    const out = await tool('apply_config_change').run(session, { changeId: 'change-1' })
    expect(out).toContain('Not applied yet: change change-1 is waiting for approval.')
    expect(out).toContain('Another workspace maintainer, not the author, must approve it')
    expect(out).toContain('check with list_config_changes status pending')
    expect(out).not.toContain('Applied')
  })

  it('tells the model to re-plan a stale draft', async () => {
    const session = setup()
    jest.mocked(applyChange).mockRejectedValue(new ConfigError('stale', 'Cấu hình đã thay đổi từ lúc soạn; hãy soạn lại thay đổi này'))
    const run = tool('apply_config_change').run(session, { changeId: 'change-1' })
    await expect(run).rejects.toBeInstanceOf(ToolInputError)
    await expect(run).rejects.toThrow('Call plan_config_change again with the same operations to get a fresh change id.')
  })

  it.each(['invalid', 'not-found', 'wrong-status', 'forbidden', 'self-approval'] as const)(
    'reports %s as a tool input error',
    async (code) => {
      const session = setup()
      jest.mocked(applyChange).mockRejectedValue(new ConfigError(code, 'Không làm được'))
      await expect(tool('apply_config_change').run(session, { changeId: 'change-1' })).rejects.toBeInstanceOf(ToolInputError)
    }
  )

  it('leaves server failures to the generic handler', async () => {
    const session = setup()
    const failure = new ConfigError('failed', 'Máy chủ không áp dụng được thay đổi; chưa có gì được ghi')
    jest.mocked(applyChange).mockRejectedValue(failure)
    await expect(tool('apply_config_change').run(session, { changeId: 'change-1' })).rejects.toBe(failure)
    const crash = new Error('socket hang up')
    jest.mocked(applyChange).mockRejectedValue(crash)
    await expect(tool('apply_config_change').run(session, { changeId: 'change-1' })).rejects.toBe(crash)
  })
})

describe('undo_config_change', () => {
  it('undoes an applied change as a new change', async () => {
    const session = setup()
    jest.mocked(undoChange).mockResolvedValue({
      kind: 'applied',
      change: changeRecord({ id: parseChangeId('change-2'), status: 'applied', undoOf: parseChangeId('change-1') })
    })
    const out = await tool('undo_config_change').run(session, { changeId: 'change-1' })
    expect(undoChange).toHaveBeenCalledWith(configOf(session), 'change-1', { isConfirmed: false })
    expect(out).toContain('Applied the undo of change change-1 (recorded as change change-2).')
    expect(out).toContain('Change change-1 is now marked undone.')
  })

  it('points at the undo draft when the undo removes data', async () => {
    const session = setup()
    jest.mocked(undoChange).mockResolvedValue({
      kind: 'needsConfirm',
      change: changeRecord({ id: parseChangeId('change-2'), undoOf: parseChangeId('change-1'), risk: 'destructive', diff: [REMOVE_LINE] })
    })
    const out = await tool('undo_config_change').run(session, { changeId: 'change-1' })
    expect(out).toContain('Not applied yet: the undo of change change-1 (recorded as change change-2) hides or removes data.')
    expect(out).toContain('call apply_config_change with changeId "change-2" and confirm: true.')
    expect(out).not.toContain('undo_config_change')
  })

  it('tells the model to undo again when the undo draft is stale', async () => {
    const session = setup()
    jest.mocked(undoChange).mockRejectedValue(new ConfigError('stale', 'Cấu hình đã thay đổi từ lúc soạn; hãy soạn lại thay đổi này'))
    const run = tool('undo_config_change').run(session, { changeId: 'change-1' })
    await expect(run).rejects.toBeInstanceOf(ToolInputError)
    await expect(run).rejects.toThrow('Call undo_config_change again with changeId "change-1"')
    await expect(run).rejects.not.toThrow('plan_config_change')
  })

  it('explains why an undo is refused', async () => {
    const session = setup()
    jest.mocked(undoChange).mockRejectedValue(new ConfigError('wrong-status', 'Thay đổi đang ở trạng thái nháp, không hoàn tác được'))
    const run = tool('undo_config_change').run(session, { changeId: 'change-1' })
    await expect(run).rejects.toBeInstanceOf(ToolInputError)
    await expect(run).rejects.toThrow(
      'Thay đổi đang ở trạng thái nháp, không hoàn tác được. Check its status with list_config_changes.'
    )
  })
})

describe('config session', () => {
  const CHANGE_CLASS = 'servone:type:ConfigChange' as Ref<Class<Doc>>

  it('reads through REST rows, not the model cached when the session opened', async () => {
    const session = setup()
    const row: Doc = { ...BASE, _id: 'change-1' as Ref<Doc>, _class: CHANGE_CLASS }
    // Mirrors RestTxClient: rows of a type created after the model loaded fail its lookup mapping.
    session.client.findAll = jest.fn().mockRejectedValue(new Error(`class not found: ${CHANGE_CLASS}`))
    session.rest.findAll = jest.fn().mockResolvedValue(toFindResult([row]))
    const write = new TxFactory(ME_SOCIAL).createTxRemoveDoc(core.class.Space, core.space.Space, 'sp-old' as Ref<Space>)
    jest.mocked(listChanges).mockImplementation(async (config) => {
      expect([...(await config.client.findAll(CHANGE_CLASS, {}))]).toEqual([row])
      await config.client.tx(write)
      return []
    })
    await tool('list_config_changes').run(session, {})
    expect(session.rest.findAll).toHaveBeenCalledWith(CHANGE_CLASS, {}, undefined)
    expect(session.client.tx).toHaveBeenCalledWith(write)
  })
})

describe('list_config_changes', () => {
  it('lists changes newest first with status, risk and people', async () => {
    const session = setup()
    jest.mocked(listChanges).mockResolvedValue([
      changeRecord({
        id: parseChangeId('change-3'),
        status: 'pending',
        risk: 'sensitive',
        summary: 'Đổi quyền Đề nghị nghỉ phép',
        author: 'social-an' as PersonId,
        createdOn: Date.UTC(2026, 8, 26, 10, 5)
      }),
      changeRecord({
        id: parseChangeId('change-2'),
        status: 'applied',
        summary: 'Hoàn tác: Tạo loại hồ sơ Đề nghị công tác',
        approver: 'social-an' as PersonId,
        undoOf: parseChangeId('change-1'),
        createdOn: Date.UTC(2026, 8, 26, 9, 45)
      }),
      changeRecord({ status: 'undone' })
    ])
    const out = await tool('list_config_changes').run(session, {})
    expect(out.split('\n')).toEqual([
      'Newest first:',
      'change-3  2026-09-26 10:05 UTC  [pending] [sensitive]  Đổi quyền Đề nghị nghỉ phép  by An Tran',
      'change-2  2026-09-26 09:45 UTC  [applied] [safe]  Hoàn tác: Tạo loại hồ sơ Đề nghị công tác  by Hung Nguyen  approved by An Tran  undoes change-1',
      'change-1  2026-09-26 09:30 UTC  [undone] [safe]  Tạo loại hồ sơ Đề nghị công tác  by Hung Nguyen'
    ])
  })

  it('passes filters and the default limit', async () => {
    const session = setup()
    jest.mocked(listChanges).mockResolvedValue([])
    const out = await tool('list_config_changes').run(session, { status: 'applied', type: 'nghi-phep' })
    expect(listChanges).toHaveBeenCalledWith(
      configOf(session),
      { status: 'applied', type: 'nghi-phep', limit: 20 }
    )
    expect(out).toBe('No config changes match')
  })

  it('lists the five studio tools over MCP with honest hints', async () => {
    const tools = await listTools()
    expect(tools.map((it) => [it.name, it.annotations])).toEqual([
      ['describe_record_types', { readOnlyHint: true }],
      ['plan_config_change', { readOnlyHint: true }],
      ['apply_config_change', { readOnlyHint: false, destructiveHint: true }],
      ['undo_config_change', { readOnlyHint: false, destructiveHint: true }],
      ['list_config_changes', { readOnlyHint: true }]
    ])
  })
})
