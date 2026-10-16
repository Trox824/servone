import chunter from '@hcengineering/chunter'
import contact, { type Person } from '@hcengineering/contact'
import core, { type Client, type PersonId, type Ref, type Space } from '@hcengineering/core'
import { getDmName, getDmPersons } from '../utils'

export interface Place {
  _id: Ref<Space>
  name: string
  isDirect: boolean
  person?: Person
}

export async function loadPlaces (client: Client): Promise<Place[]> {
  const spaces = await client.findAll(core.class.Space, {
    archived: false,
    _class: { $in: [chunter.class.Channel, chunter.class.DirectMessage] }
  })
  const places = await Promise.all(
    spaces.map(async (space): Promise<Place> => {
      if (space._class !== chunter.class.DirectMessage) return { _id: space._id, name: space.name, isDirect: false }
      const [person] = await getDmPersons(client, space)
      return { _id: space._id, name: await getDmName(client, space), isDirect: true, person }
    })
  )
  return places.sort((a, b) => Number(a.isDirect) - Number(b.isDirect) || a.name.localeCompare(b.name))
}

export async function socialIdsOf (client: Client, people: Array<Ref<Person>>): Promise<PersonId[]> {
  const identities = await client.findAll(contact.class.SocialIdentity, {
    attachedTo: { $in: people },
    attachedToClass: contact.class.Person
  })
  return identities.map((identity) => identity._id)
}
