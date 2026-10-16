import contact, { AvatarType, combineName, type Employee, type Person, type SocialIdentityRef } from '@hcengineering/contact'
import {
  AccountRole,
  buildSocialIdString,
  generateId,
  SocialIdType,
  type PersonId,
  type PersonUuid,
  type Ref,
  type TxOperations
} from '@hcengineering/core'
import { getResource, type Resource } from '@hcengineering/platform'

const SEND_INVITE = 'login:function:SendInvite' as Resource<(email: string, role: AccountRole) => Promise<void>>

export interface PersonAccounts {
  ensurePerson: (
    socialType: SocialIdType,
    socialValue: string,
    firstName: string,
    lastName: string
  ) => Promise<{ uuid: PersonUuid, socialId: PersonId }>
}

export interface NewMember {
  email: string
  firstName: string
  lastName: string
  position: string | null
}

export async function addMember (
  client: TxOperations,
  accounts: PersonAccounts,
  member: NewMember,
  sendInvite: boolean
): Promise<Ref<Employee>> {
  const key = buildSocialIdString({ type: SocialIdType.EMAIL, value: member.email })
  const identity = await client.findOne(contact.class.SocialIdentity, { key })
  const existing = identity === undefined ? undefined : await client.findOne(contact.class.Person, { _id: identity.attachedTo })
  const { uuid, socialId } = await accounts.ensurePerson(SocialIdType.EMAIL, member.email, member.firstName, member.lastName)
  const person = { name: combineName(member.firstName, member.lastName), personUuid: uuid, avatarType: AvatarType.COLOR }
  let id: Ref<Person>
  if (existing === undefined) {
    id = await client.createDoc(contact.class.Person, contact.space.Contacts, person, generateId())
  } else {
    await client.update(existing, person)
    id = existing._id
  }
  await client.createMixin(id, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, {
    active: true,
    role: AccountRole.User,
    position: member.position
  })
  if (identity === undefined) {
    await client.addCollection(
      contact.class.SocialIdentity,
      contact.space.Contacts,
      id,
      contact.class.Person,
      'socialIds',
      { type: SocialIdType.EMAIL, value: member.email, key },
      socialId as SocialIdentityRef
    )
  }
  await client.addCollection(contact.class.Channel, contact.space.Contacts, id, contact.class.Person, 'channels', {
    provider: contact.channelProvider.Email,
    value: member.email
  })
  if (sendInvite) {
    const send = await getResource(SEND_INVITE)
    await send(member.email, AccountRole.User)
  }
  return id as Ref<Employee>
}
