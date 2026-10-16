import contact, { type Employee, formatName, type Person, type SocialIdentityRef } from '@hcengineering/contact'
import { type PersonId, type Ref, SocialIdType } from '@hcengineering/core'
import { z } from 'zod'

import { type AnyTool, capText, defineTool } from '../tool'
import type { WorkspaceSession } from '../types'

const MAX_PEOPLE = 50

async function emailsByPerson (session: WorkspaceSession, persons: Array<Ref<Person>>): Promise<Map<Ref<Person>, string>> {
  if (persons.length === 0) return new Map()
  // Same identity types stock email notifications use (server-plugins/gmail-resources).
  const identities = await session.client.findAll(contact.class.SocialIdentity, {
    attachedTo: { $in: persons },
    type: { $in: [SocialIdType.EMAIL, SocialIdType.GOOGLE] },
    isDeleted: { $ne: true }
  })
  const emails = new Map<Ref<Person>, string>()
  for (const identity of identities) {
    if (!emails.has(identity.attachedTo)) emails.set(identity.attachedTo, identity.value)
  }
  return emails
}

export async function namesBySocialId (session: WorkspaceSession, socialIds: PersonId[]): Promise<Map<PersonId, string>> {
  if (socialIds.length === 0) return new Map()
  const identities = await session.client.findAll(contact.class.SocialIdentity, {
    _id: { $in: socialIds as SocialIdentityRef[] }
  })
  const persons = await session.client.findAll(contact.class.Person, {
    _id: { $in: identities.map((identity) => identity.attachedTo) }
  })
  const nameByPerson = new Map(persons.map((person) => [person._id, formatName(person.name)]))
  const names = new Map<PersonId, string>()
  for (const identity of identities) {
    const name = nameByPerson.get(identity.attachedTo)
    if (name !== undefined) names.set(identity._id, name)
  }
  return names
}

async function findEmployees (session: WorkspaceSession, query: string, limit: number): Promise<Employee[]> {
  if (!query.includes('@')) {
    return await session.client.findAll(
      contact.mixin.Employee,
      { active: true, name: { $like: `%${query}%` } },
      { limit }
    )
  }
  const identities = await session.client.findAll(
    contact.class.SocialIdentity,
    { key: `email:${query.toLowerCase()}`, isDeleted: { $ne: true } },
    { limit: 1 }
  )
  if (identities.length === 0) return []
  return await session.client.findAll(contact.mixin.Employee, { _id: identities[0].attachedTo as Ref<Employee> }, { limit: 1 })
}

const findPeople = defineTool({
  name: 'find_people',
  title: 'Find people',
  description:
    'Find workspace members by email or by part of a first or last name. ' +
    'A query containing "@" is matched as an exact email (case-insensitive); anything else is a substring of the stored name. ' +
    'Returns one line per person: "Full Name  <email>  position" (email and position omitted when unknown).',
  input: z.object({
    query: z.string().trim().min(2).describe('Email address, or part of a first or last name'),
    limit: z.number().int().min(1).max(MAX_PEOPLE).default(10)
  }),
  annotations: { readOnlyHint: true },
  run: async (session, { query, limit }) => {
    const employees = await findEmployees(session, query, limit)
    if (employees.length === 0) return `No people match "${query}"`
    const emails = await emailsByPerson(session, employees.map((employee) => employee._id))
    const lines = employees.map((employee) => {
      const parts = [formatName(employee.name)]
      const email = emails.get(employee._id)
      if (email !== undefined) parts.push(`<${email}>`)
      if (employee.position != null && employee.position !== '') parts.push(employee.position)
      return parts.join('  ')
    })
    return capText(lines.join('\n'))
  }
})

const whoami = defineTool({
  name: 'whoami',
  title: 'Who am I',
  description:
    'Show the Servone user this connection acts as: full name, email and workspace id. ' +
    'Every write made through these tools is authored by this user.',
  input: z.object({}),
  annotations: { readOnlyHint: true },
  run: async (session) => {
    const person = await session.client.findOne(contact.class.Person, { _id: session.person })
    if (person === undefined) throw new Error('No person record for this account')
    const emails = await emailsByPerson(session, [person._id])
    return [
      `Name: ${formatName(person.name)}`,
      `Email: ${emails.get(person._id) ?? 'none'}`,
      `Workspace: ${session.workspace}`
    ].join('\n')
  }
})

export const peopleTools: AnyTool[] = [findPeople, whoami]
