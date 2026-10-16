import { HEAD_DEPARTMENT, isTopOfChart, resolveManager, resolveTeamMembers, teamHandle, teamHandles, type TeamSource } from '../team'

const dept = (overrides: Partial<TeamSource> & Pick<TeamSource, '_id' | 'name'>): TeamSource => ({
  teamLead: null,
  managers: [],
  members: [],
  ...overrides
})

describe('team handles', () => {
  it('slugs names without accents', () => {
    expect(teamHandle('Phòng Đào tạo')).toBe('phong-dao-tao')
  })

  it('strips every mark in the combining range, including its ends', () => {
    expect(teamHandle('Ke\u0300 to\u036fan')).toBe('ke-toan')
  })

  it('lets the older namesake keep the bare handle and skips the root', () => {
    const handles = teamHandles([
      dept({ _id: 'b', name: 'Backend', createdOn: 2 }),
      dept({ _id: 'a', name: 'Backend', createdOn: 1 }),
      dept({ _id: HEAD_DEPARTMENT, name: 'Company' })
    ])
    expect([...handles]).toEqual([
      ['a', 'backend'],
      ['b', 'backend-2']
    ])
  })
})

describe('team members', () => {
  it('includes sub-teams, lead and managers, only active, never the sender', () => {
    const departments = [
      dept({ _id: 'eng', name: 'Eng', teamLead: 'lead', managers: ['mgr'], members: ['p1'] }),
      dept({ _id: 'fe', name: 'FE', parent: 'eng', members: ['p2', 'gone'] })
    ]
    const members = resolveTeamMembers('eng', departments, { active: new Set(['lead', 'mgr', 'p1', 'p2']), sender: 'p1' })
    expect(members.sort()).toEqual(['lead', 'mgr', 'p2'])
  })
})

describe('manager lookup', () => {
  const root = dept({ _id: HEAD_DEPARTMENT, name: 'Company', teamLead: 'ceo' })
  const eng = dept({ _id: 'eng', name: 'Eng', parent: HEAD_DEPARTMENT, teamLead: 'cto', managers: ['mgr'] })
  const active = new Set(['ceo', 'cto', 'mgr', 'dev'])

  it('sends a member to the department head, ignoring managers', () => {
    expect(resolveManager('dev', 'eng', [root, eng], active)).toBe('cto')
  })

  it('sends the head to the parent head', () => {
    expect(resolveManager('cto', 'eng', [root, eng], active)).toBe('ceo')
  })

  it('passes a headless department up to its parent', () => {
    const fe = dept({ _id: 'fe', name: 'FE', parent: 'eng' })
    expect(resolveManager('dev', 'fe', [root, eng, fe], active)).toBe('cto')
  })

  it('skips an inactive head', () => {
    expect(resolveManager('dev', 'eng', [root, eng], new Set(['ceo', 'dev']))).toBe('ceo')
  })

  it('treats a missing or unknown parent as the root', () => {
    const orphan = dept({ _id: 'orphan', name: 'Orphan', parent: 'deleted' })
    const loose = dept({ _id: 'loose', name: 'Loose' })
    expect(resolveManager('dev', 'orphan', [root, orphan], active)).toBe('ceo')
    expect(resolveManager('dev', 'loose', [root, loose], active)).toBe('ceo')
  })

  it('stops on a parent cycle', () => {
    const a = dept({ _id: 'a', name: 'A', parent: 'b' })
    const b = dept({ _id: 'b', name: 'B', parent: 'a' })
    expect(resolveManager('dev', 'a', [root, a, b], active)).toBeUndefined()
  })

  it('finds no manager for the root head', () => {
    expect(resolveManager('ceo', HEAD_DEPARTMENT, [root, eng], active)).toBeUndefined()
  })
})

describe('top of chart', () => {
  const root = dept({ _id: HEAD_DEPARTMENT, name: 'Company', teamLead: 'ceo' })
  const eng = dept({ _id: 'eng', name: 'Eng', parent: HEAD_DEPARTMENT, teamLead: 'cto' })

  it('is the active root head', () => {
    expect(isTopOfChart('ceo', [root, eng], new Set(['ceo', 'cto']))).toBe(true)
  })

  it('is not a sub-team head, an inactive root head, or anyone when the root has no head', () => {
    expect(isTopOfChart('cto', [root, eng], new Set(['ceo', 'cto']))).toBe(false)
    expect(isTopOfChart('ceo', [root, eng], new Set(['cto']))).toBe(false)
    expect(isTopOfChart('ceo', [dept({ _id: HEAD_DEPARTMENT, name: 'Company' }), eng], new Set(['ceo']))).toBe(false)
  })
})
