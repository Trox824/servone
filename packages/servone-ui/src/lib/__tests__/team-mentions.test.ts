import type { Doc, Ref } from '@hcengineering/core'
import {
  collapseTeamMentions,
  departmentClass,
  expandTeamMentions,
  headDepartment,
  matchesTeam,
  mentionedTeams,
  resolveTeamMembers,
  teamHandle,
  teamHandles,
  type TeamDepartment,
  type TeamSource
} from '../team-mentions'

const person = (id: string): Ref<Doc> => id as Ref<Doc>
const deptId = (id: string): Ref<TeamDepartment> => id as Ref<TeamDepartment>

function dept (id: string, name: string, extra: Partial<TeamSource> = {}): TeamSource {
  return { _id: deptId(id), name, teamLead: null, managers: [], members: [], ...extra }
}

const teamRef = (id: string, label: string): object => ({
  type: 'reference',
  attrs: { id, objectclass: departmentClass, label }
})
const paragraph = (...content: object[]): object => ({ type: 'paragraph', content })
const doc = (...content: object[]): string => JSON.stringify({ type: 'doc', content })
const text = (value: string): object => ({ type: 'text', text: value })

describe('teamHandle', () => {
  it('strips Vietnamese diacritics', () => {
    expect(teamHandle('Phòng Kỹ thuật')).toBe('phong-ky-thuat')
  })
  it('maps đ to d', () => {
    expect(teamHandle('Đào tạo & Phát triển')).toBe('dao-tao-phat-trien')
  })
})

describe('teamHandles', () => {
  it('gives the newer namesake a -2 suffix', () => {
    const handles = teamHandles([
      dept('new', 'Sales', { createdOn: 20 }),
      dept('old', 'sales', { createdOn: 10 })
    ])
    expect(handles.get(deptId('old'))).toBe('sales')
    expect(handles.get(deptId('new'))).toBe('sales-2')
  })
  it('skips the organization root', () => {
    expect(teamHandles([dept(headDepartment, 'Organization')]).size).toBe(0)
  })
})

describe('matchesTeam', () => {
  it('matches handle and plain name', () => {
    expect(matchesTeam('ky thu', 'Phòng Kỹ thuật', 'phong-ky-thuat')).toBe(true)
    expect(matchesTeam('Kỹ', 'Phòng Kỹ thuật', 'phong-ky-thuat')).toBe(true)
    expect(matchesTeam('sales', 'Phòng Kỹ thuật', 'phong-ky-thuat')).toBe(false)
  })
})

describe('resolveTeamMembers', () => {
  const departments = [
    dept('root', 'Sales', { teamLead: person('lead'), managers: [person('mgr')], members: [person('a'), person('b')] }),
    dept('north', 'North', { parent: deptId('root'), members: [person('b'), person('c')] }),
    dept('north-east', 'North East', { parent: deptId('north'), members: [person('d'), person('lead')] }),
    dept('other', 'Other', { members: [person('x')] })
  ]
  const active = new Set(['lead', 'mgr', 'a', 'b', 'c', 'd', 'x'].map(person))

  it('includes nested departments once each', () => {
    expect(resolveTeamMembers(deptId('root'), departments, { active }).sort()).toEqual(
      ['a', 'b', 'c', 'd', 'lead', 'mgr'].map(person)
    )
  })
  it('drops inactive people and the sender', () => {
    const someActive = new Set(['a', 'b', 'c'].map(person))
    expect(resolveTeamMembers(deptId('root'), departments, { active: someActive, sender: person('a') }).sort()).toEqual(
      ['b', 'c'].map(person)
    )
  })
})

describe('expand and collapse', () => {
  const markup = doc(paragraph(text('Hi '), teamRef('sales', 'sales'), text(' please check')))

  it('adds one hidden person mention per member after the team node', () => {
    const expanded = JSON.parse(expandTeamMentions(markup, () => [person('a'), person('b')]))
    const nodes = expanded.content[0].content
    expect(nodes).toHaveLength(5)
    expect(nodes[2].attrs).toEqual({ id: 'a', objectclass: 'contact:class:Person', label: '', servoneTeam: 'sales' })
  })
  it('collapse undoes expand', () => {
    const expanded = expandTeamMentions(markup, () => [person('a'), person('b')])
    expect(collapseTeamMentions(expanded)).toBe(markup)
  })
  it('re-expanding does not duplicate members', () => {
    const once = expandTeamMentions(markup, () => [person('a')])
    expect(expandTeamMentions(once, () => [person('a')])).toBe(once)
  })
  it('leaves markup without teams untouched', () => {
    const plain = doc(paragraph(text('hello')))
    expect(expandTeamMentions(plain, () => [person('a')])).toBe(plain)
    expect(mentionedTeams(plain)).toEqual([])
  })
  it('lists each mentioned team once', () => {
    expect(mentionedTeams(doc(paragraph(teamRef('sales', 'sales'), teamRef('sales', 'sales'))))).toEqual(['sales'])
  })
})
