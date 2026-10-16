import contact, { AvatarType, type Employee, type SocialIdentity } from '@hcengineering/contact'
import core, { type AccountUuid, type PersonId, type Ref, SocialIdType } from '@hcengineering/core'

import { createPeople, nameKeys } from '../people'

function employee (id: string, name: string, account?: string): Employee {
  return {
    _id: id as Ref<Employee>,
    _class: contact.class.Person,
    space: core.space.Workspace,
    modifiedOn: 0,
    modifiedBy: core.account.System,
    name,
    avatarType: AvatarType.COLOR,
    active: true,
    personUuid: account as AccountUuid | undefined
  }
}

function identity (id: string, person: string, type: SocialIdType, value: string): SocialIdentity {
  return {
    _id: id as PersonId & Ref<SocialIdentity>,
    _class: contact.class.SocialIdentity,
    space: core.space.Workspace,
    modifiedOn: 0,
    modifiedBy: core.account.System,
    attachedTo: person as Ref<Employee>,
    attachedToClass: contact.class.Person,
    collection: 'socialIds',
    type,
    value,
    key: `${type}:${value}`
  }
}

const people = createPeople(
  [employee('p-ann', 'Lee,Ann', 'acc-ann'), employee('p-bob', 'Bob', 'acc-bob'), employee('p-max1', 'Kim,Max'), employee('p-max2', 'Kim,Max')],
  [
    identity('s-ann-mail', 'p-ann', SocialIdType.EMAIL, 'ann@example.com'),
    identity('s-ann-huly', 'p-ann', SocialIdType.HULY, 'ann-huly'),
    identity('s-bob-mail', 'p-bob', SocialIdType.EMAIL, 'bob@example.com')
  ]
)

describe('nameKeys', () => {
  it('reads Huly names in both orders', () => {
    expect(nameKeys('Nguyen,Hung')).toEqual(['hung nguyen', 'nguyen hung'])
  })

  it('keeps a single-part name once', () => {
    expect(nameKeys('Bob')).toEqual(['bob'])
  })
})

describe('createPeople', () => {
  it('matches an email case-insensitively and prefers the Huly social id', () => {
    expect(people.match({ email: ' ANN@Example.com', name: 'Someone Else' })).toEqual({
      person: 'p-ann',
      name: 'Ann Lee',
      account: 'acc-ann',
      socialId: 's-ann-huly'
    })
  })

  it('falls back to the name in either order', () => {
    expect(people.match({ name: 'ann lee' })?.person).toBe('p-ann')
    expect(people.match({ name: 'Lee  Ann' })?.person).toBe('p-ann')
    expect(people.match({ email: 'nobody@example.com', name: 'BOB' })?.socialId).toBe('s-bob-mail')
  })

  it('leaves an ambiguous name unmatched', () => {
    expect(people.match({ name: 'Max Kim' })).toBeUndefined()
  })

  it('leaves unknown or missing people unmatched', () => {
    expect(people.match({ name: 'Zed' })).toBeUndefined()
    expect(people.match({})).toBeUndefined()
    expect(people.match(undefined)).toBeUndefined()
  })

  it('finds a person by account', () => {
    expect(people.byAccount('acc-bob' as AccountUuid)?.person).toBe('p-bob')
  })
})
