import contact, { type Employee, getFirstName, getLastName, type Person, type SocialIdentity } from '@hcengineering/contact'
import { type AccountUuid, pickPrimarySocialId, type PersonId, type Ref, type TxOperations } from '@hcengineering/core'

import type { PersonRef } from './request'

export interface WorkspacePerson {
  person: Ref<Person>
  name: string
  account: AccountUuid | undefined
  socialId: PersonId | undefined
}

export interface People {
  match: (ref: PersonRef | undefined) => WorkspacePerson | undefined
  byAccount: (account: AccountUuid) => WorkspacePerson | undefined
}

function normalize (text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function displayName (name: string): string {
  return `${getFirstName(name)} ${getLastName(name)}`.trim()
}

export function nameKeys (name: string): string[] {
  const first = getFirstName(name)
  const last = getLastName(name)
  return [...new Set([normalize(`${first} ${last}`), normalize(`${last} ${first}`)])]
}

export function createPeople (persons: Employee[], identities: SocialIdentity[]): People {
  const identitiesOf = new Map<Ref<Person>, SocialIdentity[]>()
  for (const identity of identities) {
    identitiesOf.set(identity.attachedTo, [...(identitiesOf.get(identity.attachedTo) ?? []), identity])
  }
  const known = new Map<Ref<Person>, WorkspacePerson>()
  for (const person of persons) {
    const own = identitiesOf.get(person._id) ?? []
    known.set(person._id, {
      person: person._id,
      name: displayName(person.name),
      account: person.personUuid,
      socialId: own.length > 0 ? pickPrimarySocialId(own)._id : undefined
    })
  }

  const byEmail = new Map<string, WorkspacePerson>()
  for (const identity of identities) {
    const owner = known.get(identity.attachedTo)
    if (owner !== undefined) byEmail.set(normalize(identity.value), owner)
  }
  const byName = new Map<string, WorkspacePerson | null>()
  for (const person of persons) {
    const entry = known.get(person._id)
    if (entry === undefined) continue
    for (const key of nameKeys(person.name)) {
      if (key === '') continue
      const taken = byName.get(key)
      byName.set(key, taken === undefined || taken?.person === entry.person ? entry : null)
    }
  }
  const byAccount = new Map<AccountUuid, WorkspacePerson>()
  for (const entry of known.values()) {
    if (entry.account !== undefined) byAccount.set(entry.account, entry)
  }

  return {
    match: (ref) => {
      if (ref === undefined) return undefined
      const email = ref.email === undefined ? undefined : byEmail.get(normalize(ref.email))
      if (email !== undefined) return email
      if (ref.name === undefined) return undefined
      return byName.get(normalize(ref.name)) ?? undefined
    },
    byAccount: (account) => byAccount.get(account)
  }
}

export async function loadPeople (client: Pick<TxOperations, 'findAll'>): Promise<People> {
  const persons = await client.findAll(contact.mixin.Employee, {})
  const identities = await client.findAll(contact.class.SocialIdentity, { isDeleted: { $ne: true } })
  return createPeople(persons, identities)
}
