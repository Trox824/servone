import { HEAD_DEPARTMENT, resolveManager, resolveTeamMembers, type TeamSource } from '../team'

// Fixture from docs/test-scenarios/org-chart.md; ids are the scenario names.
const dept = (fields: Partial<TeamSource> & Pick<TeamSource, '_id' | 'name'>): TeamSource => ({
  teamLead: null,
  managers: [],
  members: [],
  ...fields
})

const root = dept({ _id: HEAD_DEPARTMENT, name: 'Ban Giám đốc', teamLead: 'anh' })
const accounting = dept({ _id: 'ke-toan', name: 'Kế toán', parent: HEAD_DEPARTMENT, teamLead: 'binh', members: ['binh', 'chi'] })
const sales = dept({ _id: 'kinh-doanh', name: 'Kinh doanh', parent: HEAD_DEPARTMENT, teamLead: 'dung', members: ['dung', 'em', 'phuong'] })
const south = dept({ _id: 'mien-nam', name: 'Kinh doanh miền Nam', parent: 'kinh-doanh', members: ['phuong'] })
const tree = [root, accounting, sales, south]
const everyone = new Set(['anh', 'binh', 'chi', 'dung', 'em', 'phuong', 'ha'])

describe('org chart scenarios: who approves', () => {
  it('B1 Em goes to Dũng, head of Kinh doanh', () => {
    expect(resolveManager('em', 'kinh-doanh', tree, everyone)).toBe('dung')
  })

  it('B2 Phương in headless miền Nam goes up to Dũng', () => {
    expect(resolveManager('phuong', 'mien-nam', tree, everyone)).toBe('dung')
  })

  it('B3 Dũng, a head, goes one level up to Anh', () => {
    expect(resolveManager('dung', 'kinh-doanh', tree, everyone)).toBe('anh')
  })

  it('B4 Hà with no department is treated as root and goes to Anh', () => {
    expect(resolveManager('ha', HEAD_DEPARTMENT, tree, everyone)).toBe('anh')
  })

  it('B5 Anh, the root head, has nobody above', () => {
    expect(resolveManager('anh', HEAD_DEPARTMENT, tree, everyone)).toBeUndefined()
  })

  it('B6 Em goes to Anh while Dũng is deactivated', () => {
    const withoutDung = new Set([...everyone].filter((person) => person !== 'dung'))
    expect(resolveManager('em', 'kinh-doanh', tree, withoutDung)).toBe('anh')
  })

  it('B7 Em moved to Kế toán goes to Bình', () => {
    expect(resolveManager('em', 'ke-toan', tree, everyone)).toBe('binh')
  })

  it('E4 Chi goes to Anh when Anh heads both root and Kế toán', () => {
    const anhHeadsAccounting = { ...accounting, teamLead: 'anh' }
    expect(resolveManager('chi', 'ke-toan', [root, anhHeadsAccounting, sales, south], everyone)).toBe('anh')
  })

  it('E2 a parent loop ends without an approver instead of hanging', () => {
    const looped = [root, { ...sales, teamLead: null, parent: 'mien-nam' }, { ...south, parent: 'kinh-doanh' }]
    expect(resolveManager('em', 'kinh-doanh', looped, everyone)).toBeUndefined()
  })
})

describe('org chart scenarios: @team', () => {
  it('D3 @Kinh doanh from Em reaches Dũng and Phương, not Em', () => {
    const reached = resolveTeamMembers('kinh-doanh', tree, { active: everyone, sender: 'em' })
    expect(reached.sort()).toEqual(['dung', 'phuong'])
  })

  it('D3 inactive people are left out', () => {
    const withoutPhuong = new Set([...everyone].filter((person) => person !== 'phuong'))
    expect(resolveTeamMembers('kinh-doanh', tree, { active: withoutPhuong, sender: 'em' })).toEqual(['dung'])
  })
})
