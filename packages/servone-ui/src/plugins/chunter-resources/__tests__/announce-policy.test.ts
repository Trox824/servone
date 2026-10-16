import { canEditChannel, canManage, canPost, canReplyInThread, canSetOwners, type Actor, type ChannelAccess } from '../announce/policy'
import { announceSettings, type AnnouncedChannel } from '../announce/schema'
import type { Class, Doc, PersonId, Ref, Space } from '@hcengineering/core'

const owner: Actor = { account: 'owner', isWorkspaceAdmin: false }
const maintainer: Actor = { account: 'maint', isWorkspaceAdmin: true }
const member: Actor = { account: 'member', isWorkspaceAdmin: false }

function access (postPolicy: 'everyone' | 'admins', threadReplies: boolean): ChannelAccess {
  return { owners: ['owner'], settings: { postPolicy, threadReplies } }
}

describe('announcement policy', () => {
  it('lets everyone post in an open channel', () => {
    expect(canPost(member, access('everyone', true))).toBe(true)
  })

  it('limits posting to owners and maintainers in an admins-only channel', () => {
    const channel = access('admins', true)
    expect(canPost(owner, channel)).toBe(true)
    expect(canPost(maintainer, channel)).toBe(true)
    expect(canPost(member, channel)).toBe(false)
  })

  it('lets members reply in threads only while thread replies are on', () => {
    expect(canReplyInThread(member, access('admins', true))).toBe(true)
    expect(canReplyInThread(member, access('admins', false))).toBe(false)
    expect(canReplyInThread(owner, access('admins', false))).toBe(true)
  })

  it('gives settings to owners and maintainers only', () => {
    expect(canManage(owner, ['owner'])).toBe(true)
    expect(canManage(maintainer, ['owner'])).toBe(true)
    expect(canManage(member, ['owner'])).toBe(false)
  })

  it('keeps the last owner unless a maintainer removes them', () => {
    expect(canSetOwners(owner, ['owner'], [])).toBe(false)
    expect(canSetOwners(owner, ['owner'], ['member'])).toBe(true)
    expect(canSetOwners(maintainer, ['owner'], [])).toBe(true)
    expect(canSetOwners(member, ['owner'], ['owner', 'member'])).toBe(false)
  })
})

describe('announceSettings', () => {
  function channel (fields: Partial<AnnouncedChannel> = {}): AnnouncedChannel {
    return {
      _id: 'c1' as Ref<AnnouncedChannel>,
      _class: 'chunter:class:Channel' as Ref<Class<Doc>>,
      space: 'core:space:Space' as Ref<Space>,
      modifiedOn: 0,
      modifiedBy: 'p1' as PersonId,
      name: 'general',
      description: '',
      private: false,
      members: [],
      archived: false,
      ...fields
    }
  }

  it('defaults a channel saved before setup to open posting with replies', () => {
    expect(announceSettings(channel())).toEqual({ postPolicy: 'everyone', threadReplies: true })
  })

  it('reads stored values and ignores unknown ones', () => {
    expect(announceSettings(channel({ servonePostPolicy: 'admins', servoneThreadReplies: false }))).toEqual({
      postPolicy: 'admins',
      threadReplies: false
    })
    const stored = JSON.parse('{"servonePostPolicy":"nobody"}')
    expect(announceSettings(channel(stored)).postPolicy).toBe('everyone')
  })
})

describe('canEditChannel', () => {
  const guest: Actor = { account: 'guest', isWorkspaceAdmin: false }

  it('lets owners and maintainers edit', () => {
    expect(canEditChannel({ owners: ['owner'] }, owner)).toBe(true)
    expect(canEditChannel({ owners: ['owner'] }, maintainer)).toBe(true)
  })

  it('blocks members and guests who are not owners', () => {
    expect(canEditChannel({ owners: ['owner'] }, member)).toBe(false)
    expect(canEditChannel({ owners: ['owner'] }, guest)).toBe(false)
  })

  it('lets a guest owner edit', () => {
    expect(canEditChannel({ owners: ['guest'] }, guest)).toBe(true)
  })

  it('leaves an ownerless channel to maintainers', () => {
    expect(canEditChannel({}, member)).toBe(false)
    expect(canEditChannel({}, maintainer)).toBe(true)
  })
})
