import type { Doc, Ref } from '@hcengineering/core'
import { profileDepartment, type DepartmentSource } from '../profile-department'
import { formatHours, hoursAheadOfViewer, zoneOffsetMinutes } from '../profile-time'
import { headDepartment, type TeamDepartment } from '../team-mentions'

const person = 'p1' as Ref<Doc>

function dept (id: string, fields: Partial<DepartmentSource> = {}): DepartmentSource {
  return {
    _id: id as Ref<TeamDepartment>,
    name: id,
    teamLead: null,
    managers: [],
    members: [],
    createdOn: 0,
    ...fields
  }
}

describe('profileDepartment', () => {
  it('prefers the Staff department', () => {
    const departments = [dept('sales', { members: [person] }), dept('eng')]
    expect(profileDepartment(person, 'eng' as Ref<TeamDepartment>, departments)?._id).toBe('eng')
  })
  it('skips the Head department and falls back to membership', () => {
    const departments = [dept(headDepartment, { members: [person] }), dept('sales', { managers: [person] })]
    expect(profileDepartment(person, headDepartment, departments)?._id).toBe('sales')
  })
  it('picks the oldest department the person belongs to', () => {
    const departments = [
      dept('newer', { members: [person], createdOn: 20 }),
      dept('older', { teamLead: person, createdOn: 10 }),
      dept('other', { createdOn: 1 })
    ]
    expect(profileDepartment(person, undefined, departments)?._id).toBe('older')
  })
  it('returns nothing for a person in no department', () => {
    expect(profileDepartment(person, undefined, [dept('sales')])).toBeUndefined()
  })
})

describe('profile time', () => {
  const at = Date.UTC(2026, 8, 25, 12, 0)
  it('reads zone offsets', () => {
    expect(zoneOffsetMinutes('Asia/Ho_Chi_Minh', at)).toBe(420)
    expect(zoneOffsetMinutes('Asia/Kolkata', at)).toBe(330)
    expect(zoneOffsetMinutes('UTC', at)).toBe(0)
    expect(zoneOffsetMinutes('Not/AZone', at)).toBeUndefined()
  })
  it('compares against the viewer zone', () => {
    const mine = -new Date(at).getTimezoneOffset()
    expect(hoursAheadOfViewer('Asia/Ho_Chi_Minh', at)).toBe((420 - mine) / 60)
  })
  it('formats whole and half hours without sign', () => {
    expect(formatHours(-7)).toBe('7')
    expect(formatHours(5.5)).toBe('5.5')
  })
})
