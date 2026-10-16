import contact, { type Employee, type Person } from '@hcengineering/contact'
import type { Ref } from '@hcengineering/core'
import hr, { type Department } from '@hcengineering/hr'
import type { SharedTeamSource } from '@servone/notify-rules'
import { type MentionDirectory, resolveMentions } from '../mentions'

const ana = 'ana' as Ref<Employee>
const p1 = 'p1' as Ref<Employee>
const backend: SharedTeamSource<Ref<Department>, Ref<Employee>> = {
  _id: 'dept-1' as Ref<Department>,
  name: 'Backend',
  teamLead: null,
  managers: [],
  members: [p1, 'left' as Ref<Employee>],
  createdOn: 1
}

function directory (people: Map<string, { id: Ref<Person>, name: string }>): MentionDirectory {
  return {
    activeEmployees: async () => new Set([ana, p1]),
    activePersonByEmail: async (email) => people.get(email),
    departments: async () => [backend]
  }
}

describe('mention resolution', () => {
  it('resolves an active person by email, here, channel and a team with its active members', async () => {
    const people = new Map([['ana@x.com', { id: ana, name: 'Tran,Ana' }]])
    const lookup = await resolveMentions(directory(people), [
      '<@ana@x.com>',
      '<@ANA@x.com>',
      '<!here>',
      '<!channel>',
      '<!subteam^backend>',
      '<!subteam^nobody>',
      '<@nobody@x.com>'
    ])

    expect(lookup.get('<@ana@x.com>')).toEqual({
      id: ana,
      objectclass: contact.class.Person,
      label: 'Ana Tran',
      teamMembers: []
    })
    expect(lookup.get('<@ANA@x.com>')?.id).toBe(ana)
    expect(lookup.get('<!here>')?.id).toBe(contact.mention.Here)
    expect(lookup.get('<!channel>')?.id).toBe(contact.mention.Everyone)
    expect(lookup.get('<!subteam^backend>')).toEqual({
      id: 'dept-1',
      objectclass: hr.class.Department,
      label: 'backend',
      teamMembers: [p1]
    })
    expect(lookup.has('<!subteam^nobody>')).toBe(false)
    expect(lookup.has('<@nobody@x.com>')).toBe(false)
  })

  it('reads departments only when a team is mentioned', async () => {
    const departments = jest.fn(async () => [backend])
    await resolveMentions({ ...directory(new Map()), departments }, ['<!here>'])
    expect(departments).not.toHaveBeenCalled()
  })
})
