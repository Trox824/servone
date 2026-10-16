import { HEAD_DEPARTMENT, type TeamSource } from '@servone/notify-rules'
import { fold } from '../../../../lib/fold'
import type { Leave } from '../../../calendar-resources/lich/lib/leave'
import { buildOrgChart, departmentTree, directoryGroups, formatLeaveDay, loopAfterMove, offOn, pathTo, reportingLines, type ChartNode, type ChartStaff } from '../chart'

function dept (id: string, name: string, extra: Partial<TeamSource> = {}): TeamSource {
  return { _id: id, name, teamLead: null, managers: [], members: [], ...extra }
}
const root = dept(HEAD_DEPARTMENT, 'Organization')

function outline (node: ChartNode<TeamSource> | undefined): unknown {
  if (node === undefined) return undefined
  return { name: node.department.name, children: node.children.map(outline) }
}

describe('buildOrgChart', () => {
  it('nests three levels under the root', () => {
    const chart = buildOrgChart(
      [
        dept('team', 'Backend', { parent: 'eng' }),
        dept('eng', 'Engineering', { parent: HEAD_DEPARTMENT }),
        root
      ],
      []
    )
    expect(outline(chart)).toEqual({
      name: 'Organization',
      children: [{ name: 'Engineering', children: [{ name: 'Backend', children: [] }] }]
    })
  })

  it('hangs a department with no parent or an unknown parent under the root', () => {
    const chart = buildOrgChart([root, dept('a', 'Accounting'), dept('b', 'Sales', { parent: 'gone' })], [])
    expect(outline(chart)).toEqual({
      name: 'Organization',
      children: [
        { name: 'Accounting', children: [] },
        { name: 'Sales', children: [] }
      ]
    })
  })

  it('counts staff directly and across sub-teams', () => {
    const staff: ChartStaff[] = [
      { _id: 'ceo', department: HEAD_DEPARTMENT },
      { _id: 'ann', department: 'eng' },
      { _id: 'bob', department: 'eng' },
      { _id: 'cat', department: 'team' }
    ]
    const chart = buildOrgChart([root, dept('eng', 'Engineering'), dept('team', 'Backend', { parent: 'eng' })], staff)
    const eng = chart?.children[0]
    expect([chart?.direct, eng?.direct, eng?.children[0].direct]).toEqual([1, 2, 1])
    expect([chart?.total, eng?.total]).toEqual([4, 3])
    expect(eng?.members).toEqual(['ann', 'bob'])
  })

  it('shows a lead in the team they lead, not in their staff department', () => {
    const staff: ChartStaff[] = [
      { _id: 'duc', department: HEAD_DEPARTMENT },
      { _id: 'ann', department: 'eng' }
    ]
    const chart = buildOrgChart([root, dept('eng', 'Engineering', { teamLead: 'duc' })], staff)
    expect([chart?.members, chart?.direct, chart?.total]).toEqual([[], 0, 2])
    expect([chart?.children[0].head, chart?.children[0].members, chart?.children[0].direct]).toEqual(['duc', ['ann'], 2])
  })

  it('files staff without a department under the root', () => {
    const chart = buildOrgChart([root], [{ _id: 'ann' }])
    expect(chart?.members).toEqual(['ann'])
  })

  it('shows a head only when the team lead is on staff', () => {
    const staff: ChartStaff[] = [
      { _id: 'ann', department: 'a' }
    ]
    const chart = buildOrgChart(
      [
        root,
        dept('a', 'A', { teamLead: 'ann' }),
        dept('b', 'B', { teamLead: 'old' }),
        dept('c', 'C', { teamLead: 'nobody' })
      ],
      staff
    )
    expect(chart?.children.map((node) => node.head)).toEqual(['ann', undefined, undefined])
    expect(chart?.head).toBeUndefined()
  })

  it('orders siblings by name with Vietnamese collation', () => {
    const chart = buildOrgChart(
      [root, dept('1', 'Đào tạo'), dept('2', 'Kế toán'), dept('3', 'Dịch vụ'), dept('4', 'Bán hàng')],
      []
    )
    expect(chart?.children.map((node) => node.department.name)).toEqual(['Bán hàng', 'Dịch vụ', 'Đào tạo', 'Kế toán'])
  })

  it('draws each department of a parent cycle once', () => {
    const chart = buildOrgChart(
      [root, dept('a', 'Alpha', { parent: 'b' }), dept('b', 'Beta', { parent: 'a' }), dept('s', 'Self', { parent: 's' })],
      []
    )
    expect(outline(chart)).toEqual({
      name: 'Organization',
      children: [
        { name: 'Alpha', children: [{ name: 'Beta', children: [] }] },
        { name: 'Self', children: [] }
      ]
    })
  })

  it('gives no chart without a root department', () => {
    expect(buildOrgChart([dept('a', 'Accounting')], [])).toBeUndefined()
  })
})

describe('reportingLines', () => {
  it('reports to the team lead, and a lead to the lead above', () => {
    const departments = [
      dept(HEAD_DEPARTMENT, 'Organization', { teamLead: 'ceo' }),
      dept('eng', 'Engineering', { teamLead: 'duc', parent: HEAD_DEPARTMENT })
    ]
    const staff: ChartStaff[] = [
      { _id: 'ceo', department: HEAD_DEPARTMENT },
      { _id: 'duc', department: 'eng' },
      { _id: 'ann', department: 'eng' }
    ]
    const lines = reportingLines(departments, staff)
    expect([lines.get('ann'), lines.get('duc'), lines.get('ceo')]).toEqual(['duc', 'ceo', undefined])
  })
})

describe('pathTo', () => {
  it('walks from the root to the team a person is shown in', () => {
    const staff: ChartStaff[] = [{ _id: 'cat', department: 'team' }]
    const chart = buildOrgChart([root, dept('eng', 'Engineering'), dept('team', 'Backend', { parent: 'eng' })], staff)
    expect(chart === undefined ? [] : pathTo(chart, 'cat')).toEqual([HEAD_DEPARTMENT, 'eng', 'team'])
    expect(chart === undefined ? [] : pathTo(chart, 'nobody')).toEqual([])
  })
})

describe('loopAfterMove', () => {
  const departments = [
    dept(HEAD_DEPARTMENT, 'Organization', { teamLead: 'admin' }),
    dept('eng', 'Engineering', { teamLead: 'duc' })
  ]
  const staff: ChartStaff[] = [
    { _id: 'admin', department: 'eng' },
    { _id: 'duc', department: HEAD_DEPARTMENT }
  ]

  it('names the loop when the head of the company is filed under their own report', () => {
    expect(loopAfterMove(departments, staff, 'admin', 'eng')).toEqual(['admin', 'duc', 'admin'])
  })

  it('names no loop when they move to the team they lead, and they then have no manager', () => {
    expect(loopAfterMove(departments, staff, 'admin', HEAD_DEPARTMENT)).toEqual([])
    const lines = reportingLines(departments, [{ _id: 'admin', department: HEAD_DEPARTMENT }, staff[1]])
    expect([lines.get('admin'), lines.get('duc')]).toEqual([undefined, 'admin'])
  })

  it('names a three-person loop in reporting order', () => {
    const chain = [
      dept(HEAD_DEPARTMENT, 'Organization', { teamLead: 'ceo' }),
      dept('ops', 'Operations', { teamLead: 'ops' }),
      dept('eng', 'Engineering', { teamLead: 'cto' })
    ]
    const people: ChartStaff[] = [
      { _id: 'ceo', department: HEAD_DEPARTMENT },
      { _id: 'ops', department: 'eng' },
      { _id: 'cto', department: HEAD_DEPARTMENT }
    ]
    expect(loopAfterMove(chain, people, 'ceo', 'ops')).toEqual(['ceo', 'ops', 'cto', 'ceo'])
  })

  it('stops on a loop the move does not run through', () => {
    const people: ChartStaff[] = [
      ...staff,
      { _id: 'ann', department: HEAD_DEPARTMENT }
    ]
    expect(loopAfterMove(departments, people, 'ann', 'eng')).toEqual([])
  })
})

describe('offOn', () => {
  const today = { year: 2026, month: 9, day: 1 }
  const leave = (person: string, approval: Leave['servoneApproval'], from: number, to: number): Leave => ({
    _id: `${person}-${from}`,
    attachedTo: person,
    type: 'hr:ids:Vacation',
    tzDate: { year: 2026, month: 9, day: from },
    tzDueDate: { year: 2026, month: 9, day: to },
    servoneApproval: approval
  })
  const active = new Set(['ann', 'bob', 'cat'])

  it('lists a person with approved leave covering today and the last day off', () => {
    expect(offOn([leave('ann', 'approved', 1, 3)], today, active)).toEqual(new Map([['ann', { year: 2026, month: 9, day: 3 }]]))
  })

  it('shows nothing for pending, rejected or unmarked leave', () => {
    const leaves = [leave('ann', 'pending', 1, 3), leave('bob', 'rejected', 1, 3), leave('cat', undefined, 1, 3)]
    expect(offOn(leaves, today, active).size).toBe(0)
  })

  it('ignores approved leave that ended yesterday or starts tomorrow', () => {
    const before = { ...leave('ann', 'approved', 1, 1), tzDate: { year: 2026, month: 8, day: 28 }, tzDueDate: { year: 2026, month: 8, day: 30 } }
    expect(offOn([before, leave('bob', 'approved', 2, 5)], today, active).size).toBe(0)
  })

  it('leaves out people who are no longer active', () => {
    expect([...offOn([leave('old', 'approved', 1, 3)], today, active).keys()]).toEqual([])
  })

  it('takes the later end when two approved leaves cover today', () => {
    const off = offOn([leave('ann', 'approved', 1, 9), leave('ann', 'approved', 1, 2)], today, active)
    expect(off.get('ann')).toEqual({ year: 2026, month: 9, day: 9 })
  })
})

describe('formatLeaveDay', () => {
  it('writes day/month in Vietnamese', () => {
    expect(formatLeaveDay({ year: 2026, month: 9, day: 3 }, 'vi')).toBe('3/10')
  })

  it('writes a short month name in English', () => {
    expect(formatLeaveDay({ year: 2026, month: 9, day: 3 }, 'en')).toBe('Oct 3')
  })

  it('keeps the calendar day in any time zone', () => {
    expect(formatLeaveDay({ year: 2026, month: 0, day: 1 }, 'vi')).toBe('1/1')
  })
})

describe('fold', () => {
  it('ignores Vietnamese diacritics and case', () => {
    expect(fold('Nguyễn Văn An').includes(fold('nguyen'))).toBe(true)
    expect(fold('Trần Đức').includes(fold('duc'))).toBe(true)
    expect(fold('đ')).toBe('d')
  })
})

describe('departmentTree', () => {
  it('lists departments parent first with their depth', () => {
    const chart = buildOrgChart([root, dept('eng', 'Engineering'), dept('be', 'Backend', { parent: 'eng' }), dept('acc', 'Accounting')], [])
    expect(chart === undefined ? [] : departmentTree(chart).map(({ department, depth }) => [department.name, depth])).toEqual([
      ['Organization', 0],
      ['Accounting', 1],
      ['Engineering', 1],
      ['Backend', 2]
    ])
  })
})

describe('directoryGroups', () => {
  it('lists departments in chart order, head first, skipping empty ones', () => {
    const staff: ChartStaff[] = [
      { _id: 'ceo', department: HEAD_DEPARTMENT },
      { _id: 'ann', department: 'eng' },
      { _id: 'lead', department: HEAD_DEPARTMENT }
    ]
    const chart = buildOrgChart(
      [root, dept('eng', 'Engineering', { teamLead: 'lead' }), dept('sales', 'Sales')],
      staff
    )
    const groups = chart === undefined ? [] : directoryGroups(chart)
    expect(groups.map((group) => [group.department.name, group.people])).toEqual([
      ['Organization', ['ceo']],
      ['Engineering', ['lead', 'ann']]
    ])
  })
})
