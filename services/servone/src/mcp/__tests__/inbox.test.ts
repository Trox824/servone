import chunter, { type Channel, type ChatMessage } from '@hcengineering/chunter'
import contact, { AvatarType, type Person, type SocialIdentity } from '@hcengineering/contact'
import { type Class, type Doc, type PersonId, type Ref, SocialIdType, type Space, toFindResult } from '@hcengineering/core'
import notification, { type ActivityInboxNotification, type DocNotifyContext } from '@hcengineering/notification'
import tracker, { type Issue } from '@hcengineering/tracker'

import { inboxTools } from '../tools/inbox'
import type { WorkspaceSession } from '../types'
import { fakeSession, ME_ACCOUNT, ME_SOCIAL } from './fixtures'

const ALICE_SOCIAL = 'social-alice' as PersonId
const TOTAL_UNREAD = 7

function base<T extends Doc> (id: string, _class: Ref<Class<T>>): Pick<Doc, 'space' | 'modifiedOn' | 'modifiedBy'> & { _id: Ref<T>, _class: Ref<Class<T>> } {
  return { _id: id as Ref<T>, _class, space: 'space' as Ref<Space>, modifiedOn: 0, modifiedBy: ME_SOCIAL }
}

function context (id: string, objectId: string, objectClass: Ref<Class<Doc>>): DocNotifyContext {
  return {
    ...base<DocNotifyContext>(id, notification.class.DocNotifyContext),
    space: 'personal' as DocNotifyContext['space'],
    user: ME_ACCOUNT,
    objectId: objectId as Ref<Doc>,
    objectClass,
    objectSpace: 'space' as Ref<Space>,
    isPinned: false,
    hidden: false
  }
}

function row (id: string, ctx: DocNotifyContext, createdOn: number, attachedTo: string): ActivityInboxNotification {
  return {
    ...base<ActivityInboxNotification>(id, notification.class.ActivityInboxNotification),
    space: ctx.space,
    user: ME_ACCOUNT,
    isViewed: false,
    archived: false,
    docNotifyContext: ctx._id,
    objectId: ctx.objectId,
    objectClass: ctx.objectClass,
    attachedTo: attachedTo as Ref<ChatMessage>,
    attachedToClass: chunter.class.ChatMessage,
    createdOn,
    createdBy: ALICE_SOCIAL
  }
}

const channelContext = context('ctx-1', 'ch-general', chunter.class.Channel)
const issueContext = context('ctx-2', 'issue-12', tracker.class.Issue)

const general: Channel = {
  ...base<Channel>('ch-general', chunter.class.Channel),
  name: 'general',
  description: '',
  private: false,
  members: [ME_ACCOUNT],
  archived: false
}

const issue: Doc & Pick<Issue, 'identifier' | 'title'> = {
  ...base<Issue>('issue-12', tracker.class.Issue),
  identifier: 'SRV-12',
  title: 'Fix login'
}

const chatMessage: ChatMessage = {
  ...base<ChatMessage>('m1', chunter.class.ChatMessage),
  attachedTo: 'ch-general' as Ref<Doc>,
  attachedToClass: chunter.class.Channel,
  collection: 'messages',
  message: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'lunch?' }] }] }),
  createdBy: ALICE_SOCIAL
}

const aliceIdentity: SocialIdentity = {
  ...base<SocialIdentity>('', contact.class.SocialIdentity),
  _id: ALICE_SOCIAL as SocialIdentity['_id'],
  attachedTo: 'person-alice' as Ref<Person>,
  attachedToClass: contact.class.Person,
  collection: 'socialIds',
  type: SocialIdType.EMAIL,
  value: 'alice@example.com',
  key: 'email:alice@example.com'
}

const alice: Person = { ...base<Person>('person-alice', contact.class.Person), name: 'Smith,Alice', avatarType: AvatarType.COLOR }

function serve (session: WorkspaceSession, rows: Map<Ref<Class<Doc>>, Doc[]>): void {
  jest.mocked(session.client.findAll).mockImplementation(async (_class) => {
    const docs = rows.get(_class) ?? []
    return toFindResult(docs, _class === notification.class.InboxNotification ? TOTAL_UNREAD : docs.length)
  })
}

function tool (name: string): (typeof inboxTools)[number] {
  const found = inboxTools.find((it) => it.name === name)
  if (found === undefined) throw new Error(`no tool ${name}`)
  return found
}

describe('list_unread_notifications', () => {
  it('prints newest first with conversation title, sender and text', async () => {
    const session = fakeSession()
    serve(
      session,
      new Map<Ref<Class<Doc>>, Doc[]>([
        [
          notification.class.InboxNotification,
          [
            row('n1', channelContext, Date.UTC(2026, 8, 25, 9, 0), 'm1'),
            row('n2', issueContext, Date.UTC(2026, 8, 25, 8, 0), 'activity-1')
          ]
        ],
        [notification.class.DocNotifyContext, [channelContext, issueContext]],
        [chunter.class.Channel, [general]],
        [tracker.class.Issue, [issue]],
        [chunter.class.ChatMessage, [chatMessage]],
        [contact.class.SocialIdentity, [aliceIdentity]],
        [contact.class.Person, [alice]]
      ])
    )
    const out = await tool('list_unread_notifications').run(session, { limit: 2 })
    expect(session.client.findAll).toHaveBeenCalledWith(
      notification.class.InboxNotification,
      { user: ME_ACCOUNT, isViewed: false, archived: false },
      expect.objectContaining({ limit: 2 })
    )
    expect(out.split('\n')).toEqual([
      '2026-09-25 09:00  #general  Alice Smith: lunch?',
      '2026-09-25 08:00  SRV-12 Fix login  Alice Smith',
      'Showing 2 of 7 unread'
    ])
  })

  it('says so when the inbox is empty', async () => {
    const session = fakeSession()
    serve(session, new Map())
    expect(await tool('list_unread_notifications').run(session, {})).toBe('No unread notifications')
  })
})
