import { HEAD_DEPARTMENT } from '@servone/notify-rules'
import type { StaffRow } from '../import/csv'
import { parseStaffCsv } from '../import/csv'
import { planImport as planParsed, splitFullName, type ExistingDepartment, type ExistingPerson } from '../import/plan'
import { SAMPLE_CSV } from '../import/sample'
import { failureKey } from '../import/strings'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'

let nextLine = 2
function row (email: string, extra: Partial<StaffRow> = {}): StaffRow {
  return { line: nextLine++, name: email.split('@')[0], email, title: '', department: '', managerEmail: '', ...extra }
}
const root: ExistingDepartment = { _id: HEAD_DEPARTMENT, name: 'Công ty', teamLead: null }
function staff (id: string, extra: Partial<ExistingPerson> = {}): ExistingPerson {
  return { _id: id, email: `${id}@x.vn`, isStaff: true, title: '', department: HEAD_DEPARTMENT, ...extra }
}
const planImport = (rows: StaffRow[], people: ExistingPerson[], departments: ExistingDepartment[]): ReturnType<typeof planParsed> =>
  planParsed({ rows, errors: [] }, people, departments)
const problems = (plan: ReturnType<typeof planParsed>): Array<[string, string]> =>
  plan.errors.map((error) => [error.row.email, error.problem])

describe('planImport', () => {
  it('creates a new person and their department', () => {
    const plan = planImport([row('an@x.vn', { name: 'Nguyễn Văn An', title: 'Kế toán', department: 'Kế toán' })], [], [root])
    expect(plan.rows.map((planned) => [planned.row.email, planned.action])).toEqual([['an@x.vn', 'create']])
    expect(plan.newDepartments).toEqual([{ key: 'ke toan', name: 'Kế toán' }])
    expect(plan.errors).toEqual([])
  })

  it('updates only what the file changes and treats blanks as keep', () => {
    const sales: ExistingDepartment = { _id: 'sales', name: 'Kinh doanh', parent: HEAD_DEPARTMENT, teamLead: 'binh' }
    const people = [
      staff('an', { title: 'Kế toán' }),
      staff('binh', { department: 'sales', title: 'Trưởng phòng' }),
      staff('chi', { department: 'sales', title: 'Sales' })
    ]
    const plan = planImport(
      [
        row('an@x.vn', { name: 'Other name', title: 'Kế toán trưởng', department: 'KINH DOANH' }),
        row('binh@x.vn', { title: 'Trưởng phòng' }),
        row('chi@x.vn', { managerEmail: 'binh@x.vn' })
      ],
      people,
      [root, sales]
    )
    expect(plan.rows.map((planned) => [planned.row.email, planned.action, planned.action === 'create' ? [] : planned.changes])).toEqual([
      ['an@x.vn', 'update', ['title', 'department']],
      ['binh@x.vn', 'unchanged', []],
      ['chi@x.vn', 'unchanged', []]
    ])
    expect(plan.newDepartments).toEqual([])
    expect(plan.heads).toEqual(new Map())
  })

  it('makes a manager in the same department its head', () => {
    const plan = planImport(
      [row('lan@x.vn', { department: 'Kế toán' }), row('mai@x.vn', { department: 'Kế toán', managerEmail: 'lan@x.vn' })],
      [],
      [root]
    )
    expect(plan.heads).toEqual(new Map([['ke toan', 'lan@x.vn']]))
    expect(plan.parents).toEqual(new Map())
  })

  it('puts a department under the manager named from another department', () => {
    const plan = planImport(
      [
        row('an@x.vn', { department: 'Ban giám đốc' }),
        row('binh@x.vn', { department: 'Kinh doanh', managerEmail: 'an@x.vn' }),
        row('cuong@x.vn', { department: 'Kinh doanh', managerEmail: 'binh@x.vn' })
      ],
      [],
      [root]
    )
    expect(plan.heads).toEqual(new Map([['kinh doanh', 'binh@x.vn'], ['ban giam doc', 'an@x.vn']]))
    expect(plan.parents).toEqual(new Map([['kinh doanh', 'ban giam doc']]))
    expect(plan.errors).toEqual([])
  })

  it('flags a manager change against the current reporting line', () => {
    const sales: ExistingDepartment = { _id: 'sales', name: 'Kinh doanh', teamLead: 'binh' }
    const plan = planImport(
      [row('chi@x.vn', { managerEmail: 'dung@x.vn' })],
      [staff('binh', { department: 'sales' }), staff('chi', { department: 'sales' }), staff('dung', { department: 'sales' })],
      [root, sales]
    )
    expect(plan.rows[0]).toMatchObject({ action: 'update', changes: ['manager'] })
    expect(plan.heads).toEqual(new Map([['sales', 'dung@x.vn']]))
  })

  it('skips rows that cannot be staff and keeps the rest', () => {
    const plan = planImport(
      [
        row('ok@x.vn', { name: 'Ổn' }),
        row('ok@x.vn', { name: 'Again' }),
        row('guest@x.vn', { name: 'Khách' }),
        row('noname@x.vn', { name: '' }),
        row('self@x.vn', { managerEmail: 'self@x.vn' }),
        row('lost@x.vn', { managerEmail: 'nobody@x.vn' })
      ],
      [staff('guest', { isStaff: false })],
      [root]
    )
    expect(problems(plan)).toEqual([
      ['ok@x.vn', 'DuplicateEmail'],
      ['guest@x.vn', 'NotStaff'],
      ['noname@x.vn', 'MissingName'],
      ['self@x.vn', 'SelfManager'],
      ['lost@x.vn', 'UnknownManager']
    ])
    expect(plan.rows.map((planned) => planned.row.email)).toEqual(['ok@x.vn'])
  })

  it('reports rows whose manager row was skipped, down the chain', () => {
    const plan = planImport(
      [
        row('c@x.vn', { department: 'Kỹ thuật', managerEmail: 'b@x.vn' }),
        row('b@x.vn', { name: '', department: 'Kỹ thuật', managerEmail: 'a@x.vn' }),
        row('d@x.vn', { department: 'Kỹ thuật', managerEmail: 'c@x.vn' })
      ],
      [],
      [root]
    )
    expect(problems(plan)).toEqual([
      ['c@x.vn', 'ManagerSkipped'],
      ['b@x.vn', 'MissingName'],
      ['d@x.vn', 'ManagerSkipped']
    ])
  })

  it('reports a row whose manager failed to parse as skipped, not unknown', () => {
    const broken = row('', { name: 'Bad' })
    const plan = planParsed(
      { rows: [row('c@x.vn', { managerEmail: 'b@x.vn' })], errors: [{ row: { ...broken, email: 'b@x.vn', managerEmail: 'nope' }, problem: 'BadManagerEmail' }] },
      [],
      [root]
    )
    expect(problems(plan)).toEqual([['b@x.vn', 'BadManagerEmail'], ['c@x.vn', 'ManagerSkipped']])
  })

  it('keeps the first head named for a department', () => {
    const plan = planImport(
      [
        row('lan@x.vn', { department: 'Kế toán' }),
        row('mai@x.vn', { department: 'Kế toán', managerEmail: 'lan@x.vn' }),
        row('ngoc@x.vn', { department: 'Kế toán' }),
        row('oanh@x.vn', { department: 'Kế toán', managerEmail: 'ngoc@x.vn' })
      ],
      [],
      [root]
    )
    expect(problems(plan)).toEqual([['oanh@x.vn', 'HeadConflict']])
    expect(plan.heads).toEqual(new Map([['ke toan', 'lan@x.vn']]))
  })

  it('refuses a reporting loop and a manager for the top of the chart', () => {
    const plan = planImport(
      [
        row('a@x.vn', { department: 'A' }),
        row('b@x.vn', { department: 'B', managerEmail: 'a@x.vn' }),
        row('a2@x.vn', { department: 'A', managerEmail: 'b@x.vn' }),
        row('top@x.vn', { managerEmail: 'a@x.vn' })
      ],
      [],
      [root]
    )
    expect(problems(plan)).toEqual([['a2@x.vn', 'ReportingLoop'], ['top@x.vn', 'TopHasManager']])
  })

  it('plans the sample file without errors', () => {
    const parsed = parseStaffCsv(SAMPLE_CSV)
    if (!('rows' in parsed)) throw new Error('sample did not parse')
    const plan = planParsed(parsed, [], [root])
    expect(parsed.errors).toEqual([])
    expect(plan.errors).toEqual([])
    expect(plan.rows).toHaveLength(10)
    expect(plan.newDepartments.map((dept) => dept.name)).toEqual(['Ban giám đốc', 'Kinh doanh', 'Kỹ thuật', 'Kế toán'])
    expect(plan.heads.get('ban giam doc')).toBe('an.nguyen@example.com')
    expect(plan.parents).toEqual(new Map([['kinh doanh', 'ban giam doc'], ['ky thuat', 'ban giam doc'], ['ke toan', 'ban giam doc']]))
  })
})

describe('splitFullName', () => {
  it('stores the Vietnamese family name as the last name', () => {
    expect(splitFullName('Nguyễn Văn An')).toEqual({ firstName: 'Văn An', lastName: 'Nguyễn' })
    expect(splitFullName('An')).toEqual({ firstName: 'An', lastName: '' })
  })
})

describe('failureKey', () => {
  const platformError = (code: Status['code']): Error => new PlatformError(new Status(Severity.ERROR, code, {}))

  it('names permission, session and connection failures', () => {
    expect(failureKey(platformError(platform.status.Forbidden))).toBe('FailNoPermission')
    expect(failureKey(platformError(platform.status.Unauthorized))).toBe('FailNoPermission')
    expect(failureKey(platformError(platform.status.TokenExpired))).toBe('FailSessionExpired')
    expect(failureKey(platformError(platform.status.ConnectionClosed))).toBe('FailConnection')
    expect(failureKey(new TypeError('Failed to fetch'))).toBe('FailConnection')
  })

  it('falls back to a generic message for anything else', () => {
    expect(failureKey(platformError(platform.status.BadRequest))).toBe('FailUnknown')
    expect(failureKey(new Error('boom'))).toBe('FailUnknown')
  })
})
