import contact, { AvatarType, type Employee, type Person, type SocialIdentity } from '@hcengineering/contact'
import { type Class, type Doc, type Ref, SocialIdType, type Space, toFindResult } from '@hcengineering/core'

import { peopleTools } from '../tools/people'
import type { WorkspaceSession } from '../types'
import { fakeSession, ME_PERSON, ME_SOCIAL, WORKSPACE } from './fixtures'

function base<T extends Doc> (id: string, _class: Ref<Class<T>>): Pick<Doc, 'space' | 'modifiedOn' | 'modifiedBy'> & { _id: Ref<T>, _class: Ref<Class<T>> } {
  return { _id: id as Ref<T>, _class, space: 'space' as Ref<Space>, modifiedOn: 0, modifiedBy: ME_SOCIAL }
}

function employee (id: string, name: string, position?: string): Employee {
  return { ...base<Employee>(id, contact.class.Person), name, avatarType: AvatarType.COLOR, active: true, position }
}

function email (person: string, address: string): SocialIdentity {
  return {
    ...base<SocialIdentity>('', contact.class.SocialIdentity),
    _id: `sid-${person}` as SocialIdentity['_id'],
    attachedTo: person as Ref<Person>,
    attachedToClass: contact.class.Person,
    collection: 'socialIds',
    type: SocialIdType.EMAIL,
    value: address,
    key: `email:${address}`
  }
}

function serve (session: WorkspaceSession, rows: Map<Ref<Class<Doc>>, Doc[]>): void {
  jest.mocked(session.client.findAll).mockImplementation(async (_class) => toFindResult(rows.get(_class) ?? []))
}

function tool (name: string): (typeof peopleTools)[number] {
  const found = peopleTools.find((it) => it.name === name)
  if (found === undefined) throw new Error(`no tool ${name}`)
  return found
}

describe('find_people', () => {
  it('looks up an email by lowercased social key', async () => {
    const session = fakeSession()
    serve(
      session,
      new Map<Ref<Class<Doc>>, Doc[]>([
        [contact.class.SocialIdentity, [email('p-bob', 'bob@example.com')]],
        [contact.mixin.Employee, [employee('p-bob', 'Stone,Bob', 'Designer')]]
      ])
    )
    const out = await tool('find_people').run(session, { query: ' Bob@Example.com ' })
    expect(session.client.findAll).toHaveBeenCalledWith(
      contact.class.SocialIdentity,
      { key: 'email:bob@example.com', isDeleted: { $ne: true } },
      expect.anything()
    )
    expect(out).toBe('Bob Stone  <bob@example.com>  Designer')
  })

  it('searches active employees by name with $like', async () => {
    const session = fakeSession()
    serve(
      session,
      new Map<Ref<Class<Doc>>, Doc[]>([
        [contact.mixin.Employee, [employee('p-bob', 'Stone,Bob'), employee('p-ann', 'Stone,Ann')]],
        [contact.class.SocialIdentity, [email('p-bob', 'bob@example.com')]]
      ])
    )
    const out = await tool('find_people').run(session, { query: 'Stone', limit: 5 })
    expect(session.client.findAll).toHaveBeenCalledWith(
      contact.mixin.Employee,
      { active: true, name: { $like: '%Stone%' } },
      expect.objectContaining({ limit: 5 })
    )
    expect(out.split('\n')).toEqual(['Bob Stone  <bob@example.com>', 'Ann Stone'])
  })

  it('says so when nobody matches', async () => {
    const session = fakeSession()
    serve(session, new Map())
    expect(await tool('find_people').run(session, { query: 'zz' })).toBe('No people match "zz"')
  })

  it('rejects a one-character query', async () => {
    await expect(tool('find_people').run(fakeSession(), { query: 'a' })).rejects.toThrow()
  })
})

describe('whoami', () => {
  it('prints name, email and workspace', async () => {
    const session = fakeSession()
    jest.mocked(session.client.findOne).mockResolvedValue(employee(ME_PERSON, 'Doe,Jane'))
    serve(session, new Map([[contact.class.SocialIdentity, [email(ME_PERSON, 'jane@example.com')]]]))
    const out = await tool('whoami').run(session, {})
    expect(out).toBe(`Name: Jane Doe\nEmail: jane@example.com\nWorkspace: ${WORKSPACE}`)
  })

  it('fails clearly when the person record is missing', async () => {
    const session = fakeSession()
    jest.mocked(session.client.findOne).mockResolvedValue(undefined)
    await expect(tool('whoami').run(session, {})).rejects.toThrow('No person record for this account')
  })
})
