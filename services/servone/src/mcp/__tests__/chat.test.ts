import chunter, { type Channel, type ChatMessage, type DirectMessage } from '@hcengineering/chunter'
import contact, { AvatarType, type Employee, type Person, type SocialIdentity } from '@hcengineering/contact'
import {
  type AccountUuid,
  type Class,
  type Doc,
  type PersonId,
  type Ref,
  SocialIdType,
  type Space,
  toFindResult
} from '@hcengineering/core'

import { chatTools } from '../tools/chat'
import { ToolInputError } from '../tool'
import type { WorkspaceSession } from '../types'
import { fakeSession, ME_ACCOUNT, ME_SOCIAL } from './fixtures'

const ALICE_ACCOUNT = 'acc-alice' as AccountUuid
const ALICE_SOCIAL = 'social-alice' as PersonId

function base<T extends Doc> (id: string, _class: Ref<Class<T>>): Pick<Doc, 'space' | 'modifiedOn' | 'modifiedBy'> & { _id: Ref<T>, _class: Ref<Class<T>> } {
  return { _id: id as Ref<T>, _class, space: 'space' as Ref<Space>, modifiedOn: 0, modifiedBy: ME_SOCIAL }
}

function channel (name: string, overrides: Partial<Channel> = {}): Channel {
  return {
    ...base<Channel>(`ch-${name}`, chunter.class.Channel),
    name,
    description: '',
    private: false,
    members: [ME_ACCOUNT],
    archived: false,
    ...overrides
  }
}

function message (id: string, createdOn: number, text: string): ChatMessage {
  return {
    ...base<ChatMessage>(id, chunter.class.ChatMessage),
    attachedTo: 'ch-general' as Ref<Doc>,
    attachedToClass: chunter.class.Channel,
    collection: 'messages',
    message: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }),
    createdOn,
    createdBy: ALICE_SOCIAL
  }
}

const aliceIdentity: SocialIdentity = {
  ...base<SocialIdentity>(ALICE_SOCIAL, contact.class.SocialIdentity),
  _id: ALICE_SOCIAL as SocialIdentity['_id'],
  attachedTo: 'person-alice' as Ref<Person>,
  attachedToClass: contact.class.Person,
  collection: 'socialIds',
  type: SocialIdType.EMAIL,
  value: 'alice@example.com',
  key: 'email:alice@example.com'
}

const alicePerson: Employee = {
  ...base<Employee>('person-alice', contact.class.Person),
  name: 'Smith,Alice',
  avatarType: AvatarType.COLOR,
  active: true,
  personUuid: ALICE_ACCOUNT
}

function serve (session: WorkspaceSession, rows: Map<Ref<Class<Doc>>, Doc[]>): void {
  jest.mocked(session.client.findAll).mockImplementation(async (_class) => toFindResult(rows.get(_class) ?? []))
}

function tool (name: string): (typeof chatTools)[number] {
  const found = chatTools.find((it) => it.name === name)
  if (found === undefined) throw new Error(`no tool ${name}`)
  return found
}

describe('list_channels', () => {
  it('lists member, non-archived channels', async () => {
    const session = fakeSession()
    serve(session, new Map([[chunter.class.Channel, [channel('general', { topic: 'Company news' }), channel('random')]]]))
    const out = await tool('list_channels').run(session, {})
    expect(session.client.findAll).toHaveBeenCalledWith(
      chunter.class.Channel,
      { members: ME_ACCOUNT, archived: false },
      expect.anything()
    )
    expect(out).toContain('#general  Company news')
    expect(out).toContain('#random')
  })

  it('titles direct messages by the other members', async () => {
    const session = fakeSession()
    const direct: DirectMessage = {
      ...base<DirectMessage>('dm-1', chunter.class.DirectMessage),
      name: '',
      description: '',
      private: true,
      members: [ME_ACCOUNT, ALICE_ACCOUNT],
      archived: false
    }
    serve(
      session,
      new Map<Ref<Class<Doc>>, Doc[]>([
        [chunter.class.DirectMessage, [direct]],
        [contact.mixin.Employee, [alicePerson]]
      ])
    )
    const out = await tool('list_channels').run(session, { includeDirect: true })
    expect(out).toContain('DM with Alice Smith  id: dm-1')
  })
})

describe('read_channel', () => {
  it('prints messages oldest first with author names', async () => {
    const session = fakeSession()
    serve(
      session,
      new Map<Ref<Class<Doc>>, Doc[]>([
        [chunter.class.Channel, [channel('general')]],
        [
          chunter.class.ChatMessage,
          [message('m2', Date.UTC(2026, 8, 25, 10, 5), 'second'), message('m1', Date.UTC(2026, 8, 25, 9, 0), 'first')]
        ],
        [contact.class.SocialIdentity, [aliceIdentity]],
        [contact.class.Person, [alicePerson]]
      ])
    )
    const out = await tool('read_channel').run(session, { channel: '#General', limit: 2 })
    expect(session.client.findAll).toHaveBeenCalledWith(
      chunter.class.ChatMessage,
      { attachedTo: 'ch-general' },
      expect.objectContaining({ limit: 2 })
    )
    const lines = out.split('\n')
    expect(lines[0]).toBe('2026-09-25 09:00 Alice Smith: first')
    expect(lines[1]).toBe('2026-09-25 10:05 Alice Smith: second')
  })

  it('names close channels when the channel is unknown', async () => {
    const session = fakeSession()
    serve(session, new Map([[chunter.class.Channel, [channel('general'), channel('general-eng'), channel('random')]]]))
    const run = tool('read_channel').run(session, { channel: 'genral' })
    await expect(run).rejects.toThrow(ToolInputError)
    await expect(run).rejects.toThrow('Channel #genral not found. Your channels: #general, #general-eng, #random')
  })
})

describe('post_message', () => {
  it('refuses a channel the caller is not a member of', async () => {
    const session = fakeSession()
    serve(session, new Map([[chunter.class.Channel, [channel('secret', { members: [ALICE_ACCOUNT] })]]]))
    const run = tool('post_message').run(session, { channel: 'secret', text: 'hi' })
    await expect(run).rejects.toThrow(new ToolInputError('You are not a member of #secret'))
    expect(session.client.addCollection).not.toHaveBeenCalled()
  })

  it('refuses an archived channel', async () => {
    const session = fakeSession()
    serve(session, new Map([[chunter.class.Channel, [channel('old', { archived: true })]]]))
    const run = tool('post_message').run(session, { channel: 'old', text: 'hi' })
    await expect(run).rejects.toThrow(new ToolInputError('#old is archived'))
    expect(session.client.addCollection).not.toHaveBeenCalled()
  })

  it('posts markdown as a chat message in the channel', async () => {
    const session = fakeSession()
    serve(session, new Map([[chunter.class.Channel, [channel('general')]]]))
    jest.mocked(session.client.addCollection).mockResolvedValue('msg-1' as Ref<ChatMessage>)
    const out = await tool('post_message').run(session, { channel: 'general', text: 'hello **team**' })
    expect(session.client.addCollection).toHaveBeenCalledWith(
      chunter.class.ChatMessage,
      'ch-general',
      'ch-general',
      chunter.class.Channel,
      'messages',
      { message: expect.stringContaining('"text":"team"') }
    )
    expect(out).toBe('Posted to #general')
  })

  it('rejects text over the message limit', async () => {
    const session = fakeSession()
    await expect(tool('post_message').run(session, { channel: 'general', text: 'x'.repeat(10_001) })).rejects.toThrow()
  })
})
