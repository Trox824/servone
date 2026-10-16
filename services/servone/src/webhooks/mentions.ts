// Slack's mention syntax with our identifiers: <@email>, <!subteam^handle>, <!here>, <!channel>, <!everyone>.
import type { RestClient } from '@hcengineering/api-client'
import contact, { type Employee, formatName, type Person } from '@hcengineering/contact'
import { type Class, type Doc, type Ref, SocialIdType } from '@hcengineering/core'
import hr, { type Department } from '@hcengineering/hr'
import { resolveTeamMembers, type SharedTeamSource, teamHandles } from '@servone/notify-rules'

export const MENTION_TOKEN_PATTERN = /<(?:@[^\s<>|@]+@[^\s<>|]+|!(?:here|channel|everyone)|!subteam\^[a-z0-9-]+)>/g
const SUBTEAM_PREFIX = '!subteam^'

export interface ResolvedMention {
  id: Ref<Doc>
  objectclass: Ref<Class<Doc>>
  label: string
  teamMembers: Array<Ref<Employee>>
}

export type MentionLookup = ReadonlyMap<string, ResolvedMention>
export const NO_MENTIONS: MentionLookup = new Map()

export function mentionTokens (text: string): string[] {
  return [...new Set(text.match(MENTION_TOKEN_PATTERN) ?? [])]
}

export function mentionText (token: string): string {
  const inner = token.slice(1, -1)
  if (inner.startsWith('@')) return inner.slice(1)
  if (inner.startsWith(SUBTEAM_PREFIX)) return `@${inner.slice(SUBTEAM_PREFIX.length)}`
  return `@${inner.slice(1)}`
}

type TeamDepartment = SharedTeamSource<Ref<Department>, Ref<Employee>>

export interface MentionDirectory {
  activeEmployees: () => Promise<Set<Ref<Employee>>>
  activePersonByEmail: (email: string) => Promise<{ id: Ref<Person>, name: string } | undefined>
  departments: () => Promise<TeamDepartment[]>
}

export function workspaceDirectory (client: RestClient): MentionDirectory {
  return {
    activeEmployees: async () =>
      new Set((await client.findAll(contact.mixin.Employee, { active: true })).map((employee) => employee._id)),
    activePersonByEmail: async (email) => {
      const identities = await client.findAll(contact.class.SocialIdentity, {
        value: email,
        type: { $in: [SocialIdType.EMAIL, SocialIdType.GOOGLE] },
        isDeleted: { $ne: true }
      })
      if (identities.length === 0) return undefined
      const owners = new Set<Ref<Person>>(identities.map((identity) => identity.attachedTo))
      const employees = await client.findAll(contact.mixin.Employee, { active: true })
      const employee = employees.find((candidate) => owners.has(candidate._id))
      return employee === undefined ? undefined : { id: employee._id, name: employee.name }
    },
    departments: async () => await client.findAll(hr.class.Department, {})
  }
}

function fixedMention (id: Ref<Doc>, label: string): ResolvedMention {
  return { id, objectclass: contact.mixin.Employee, label, teamMembers: [] }
}

export async function resolveMentions (directory: MentionDirectory, tokens: string[]): Promise<MentionLookup> {
  const lookup = new Map<string, ResolvedMention>()
  let active: Set<Ref<Employee>> | undefined
  let departments: TeamDepartment[] | undefined
  for (const token of tokens) {
    const inner = token.slice(1, -1)
    if (inner === '!here') {
      lookup.set(token, fixedMention(contact.mention.Here, 'here'))
    } else if (inner === '!channel' || inner === '!everyone') {
      lookup.set(token, fixedMention(contact.mention.Everyone, 'everyone'))
    } else if (inner.startsWith(SUBTEAM_PREFIX)) {
      departments ??= await directory.departments()
      active ??= await directory.activeEmployees()
      const handle = inner.slice(SUBTEAM_PREFIX.length)
      const team = [...teamHandles(departments)].find(([, candidate]) => candidate === handle)?.[0]
      if (team === undefined) continue
      lookup.set(token, {
        id: team,
        objectclass: hr.class.Department,
        label: handle,
        teamMembers: resolveTeamMembers(team, departments, { active })
      })
    } else {
      // Social identities store emails lowercased.
      const person = await directory.activePersonByEmail(inner.slice(1).toLowerCase())
      if (person === undefined) continue
      lookup.set(token, { id: person.id, objectclass: contact.class.Person, label: formatName(person.name), teamMembers: [] })
    }
  }
  return lookup
}
