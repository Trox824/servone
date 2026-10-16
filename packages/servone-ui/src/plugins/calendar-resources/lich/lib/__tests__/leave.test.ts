import { AccountRole, type AccountUuid, type WorkspaceMemberInfo } from '@hcengineering/core'
import { leaveAdmins, leaveItems, shortNames, type Leave } from '../leave'

const leave = (id: string, approval: Leave['servoneApproval'], person = 'binh'): Leave => ({
  _id: id,
  attachedTo: person,
  type: 'hr:ids:Vacation',
  tzDate: { year: 2026, month: 8, day: 29 },
  tzDueDate: { year: 2026, month: 9, day: 1 },
  servoneApproval: approval
})
const colorOf = (person: string): string => (person === 'binh' ? 'var(--lich-overlay-1)' : 'var(--primary)')

describe('leaveItems', () => {
  it('keeps only approved leave', () => {
    const leaves = [leave('a', 'approved'), leave('p', 'pending'), leave('r', 'rejected'), leave('w', 'withdrawn'), leave('u', undefined)]
    expect(leaveItems(leaves, colorOf).map((item) => item._id)).toEqual(['a'])
  })
  it('spans every day from the first to the last, inclusive, as an all-day item', () => {
    const [item] = leaveItems([leave('a', 'approved')], colorOf)
    expect(item).toMatchObject({
      allDay: true,
      date: Date.UTC(2026, 8, 29),
      dueDate: Date.UTC(2026, 9, 1, 23, 59, 59, 999)
    })
  })
  it("takes the leave owner's overlay colour", () => {
    const [mine, colleague] = leaveItems([leave('m', 'approved', 'me'), leave('b', 'approved', 'binh')], colorOf)
    expect([mine.color, colleague.color]).toEqual(['var(--primary)', 'var(--lich-overlay-1)'])
  })
})

describe('shortNames', () => {
  it('uses the first name alone when it is unique', () => {
    expect(shortNames([{ first: 'An', last: 'Nguyễn' }, { first: 'Bình', last: 'Trần' }])).toEqual(['An', 'Bình'])
  })
  it('adds the last-name initial when two people share a first name', () => {
    const names = shortNames([{ first: 'An', last: 'Nguyễn' }, { first: 'An', last: 'Lê' }, { first: 'Bình', last: 'Trần' }])
    expect(names).toEqual(['An N.', 'An L.', 'Bình'])
  })
  it('keeps the first name when there is no last name to tell them apart', () => {
    expect(shortNames([{ first: 'An', last: '' }, { first: 'An', last: 'Lê' }])).toEqual(['An', 'An L.'])
  })
})

describe('leaveAdmins', () => {
  const member = (person: string, role: AccountRole, disabled = false): WorkspaceMemberInfo => ({
    person: person as AccountUuid,
    role,
    disabled
  })
  it('lists owners before maintainers and leaves out everyone else and me', () => {
    const members = [
      member('mai', AccountRole.Maintainer),
      member('me', AccountRole.Owner),
      member('user', AccountRole.User),
      member('owner', AccountRole.Owner),
      member('guest', AccountRole.Guest)
    ]
    expect(leaveAdmins(members, 'me' as AccountUuid)).toEqual(['owner', 'mai'])
  })
  it('leaves out deactivated admins', () => {
    const members = [member('mai', AccountRole.Maintainer), member('old', AccountRole.Owner, true)]
    expect(leaveAdmins(members, 'me' as AccountUuid)).toEqual(['mai'])
  })
})
