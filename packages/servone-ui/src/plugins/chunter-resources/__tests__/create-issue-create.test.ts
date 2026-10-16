import type { ActivityMessage } from '@hcengineering/activity'
import type { Attachment } from '@hcengineering/attachment'
import type { ChatMessage, ThreadMessage } from '@hcengineering/chunter'
import type { Blob, Class, Doc, PersonId, Ref, Space } from '@hcengineering/core'
import type { Issue, Project } from '@hcengineering/tracker'

import {
  canCreateIssueFrom,
  conversationOf,
  copyAttachments,
  type CreatedIssue,
  issueReplyMarkup,
  lastProjectFor,
  postIssueReply,
  rememberProject
} from '../create-issue/create'

jest.mock(
  '@hcengineering/chunter',
  () => ({
    __esModule: true,
    default: {
      class: {
        ThreadMessage: 'chunter:class:ThreadMessage',
        ChunterSpace: 'chunter:class:ChunterSpace'
      }
    }
  }),
  { virtual: true }
)

const CHANNEL = 'chunter:class:Channel' as Ref<Class<Doc>>

function channelMessage (): ChatMessage {
  return {
    _id: 'm1' as Ref<ChatMessage>,
    _class: 'chunter:class:ChatMessage' as Ref<Class<ChatMessage>>,
    space: 'c1' as Ref<Space>,
    attachedTo: 'c1' as Ref<Doc>,
    attachedToClass: CHANNEL,
    collection: 'messages',
    message: '{"type":"doc","content":[]}',
    attachments: 2,
    modifiedOn: 0,
    modifiedBy: 'social1' as PersonId
  }
}

function threadMessage (): ThreadMessage {
  return {
    ...channelMessage(),
    _id: 'm2' as Ref<ThreadMessage>,
    _class: 'chunter:class:ThreadMessage' as Ref<Class<ThreadMessage>>,
    attachedTo: 'm1' as Ref<ActivityMessage>,
    attachedToClass: 'chunter:class:ChatMessage' as Ref<Class<ActivityMessage>>,
    collection: 'replies',
    objectId: 'c1' as Ref<Doc>,
    objectClass: CHANNEL
  }
}

function file (id: string, blob: string): Attachment {
  return {
    _id: id as Ref<Attachment>,
    _class: 'attachment:class:Attachment' as Ref<Class<Attachment>>,
    space: 'c1' as Ref<Space>,
    attachedTo: 'm1' as Ref<Doc>,
    attachedToClass: 'chunter:class:ChatMessage' as Ref<Class<Doc>>,
    collection: 'attachments',
    modifiedOn: 0,
    modifiedBy: 'social1' as PersonId,
    name: `${id}.png`,
    file: blob as Ref<Blob>,
    type: 'image/png',
    size: 1024,
    lastModified: 7
  }
}

const ISSUE: CreatedIssue = {
  _id: 'i1' as Ref<Issue>,
  space: 'p1' as Ref<Project>,
  identifier: 'SRV-12',
  title: 'Deploy failed'
}

const chatHierarchy = {
  isDerived: (cls: Ref<Class<Doc>>, parent: Ref<Class<Doc>>): boolean =>
    parent === 'chunter:class:ChunterSpace' && ['chunter:class:Channel', 'chunter:class:DirectMessage'].includes(cls)
}

describe('conversationOf', () => {
  it('is the channel for a channel message', () => {
    expect(conversationOf(channelMessage())).toEqual({ _id: 'c1', _class: CHANNEL })
  })
  it('is the channel, not the parent message, for a thread reply', () => {
    expect(conversationOf(threadMessage())).toEqual({ _id: 'c1', _class: CHANNEL })
  })
})

describe('canCreateIssueFrom', () => {
  it('allows channel, direct and thread messages', () => {
    const direct = { ...channelMessage(), attachedToClass: 'chunter:class:DirectMessage' as Ref<Class<Doc>> }
    expect(canCreateIssueFrom(chatHierarchy, channelMessage())).toBe(true)
    expect(canCreateIssueFrom(chatHierarchy, direct)).toBe(true)
    expect(canCreateIssueFrom(chatHierarchy, threadMessage())).toBe(true)
  })
  it('hides the action on a comment attached to an issue', () => {
    const comment = { ...channelMessage(), attachedTo: 'i9' as Ref<Doc>, attachedToClass: 'tracker:class:Issue' as Ref<Class<Doc>> }
    expect(canCreateIssueFrom(chatHierarchy, comment)).toBe(false)
  })
})

describe('copyAttachments', () => {
  it('adds each file to the issue with the same blob', async () => {
    const addCollection = jest.fn().mockResolvedValue('copy')
    const failedCount = await copyAttachments({ addCollection }, [file('a1', 'blob-a'), file('a2', 'blob-b')], ISSUE)
    expect(failedCount).toBe(0)
    expect(addCollection.mock.calls).toEqual([
      [
        'attachment:class:Attachment',
        'p1',
        'i1',
        'tracker:class:Issue',
        'attachments',
        { name: 'a1.png', file: 'blob-a', type: 'image/png', size: 1024, lastModified: 7, metadata: undefined }
      ],
      [
        'attachment:class:Attachment',
        'p1',
        'i1',
        'tracker:class:Issue',
        'attachments',
        { name: 'a2.png', file: 'blob-b', type: 'image/png', size: 1024, lastModified: 7, metadata: undefined }
      ]
    ])
  })

  it('writes nothing when the message has no files', async () => {
    const addCollection = jest.fn()
    expect(await copyAttachments({ addCollection }, [], ISSUE)).toBe(0)
    expect(addCollection).not.toHaveBeenCalled()
  })

  it('counts a failed copy and still tries the rest', async () => {
    const addCollection = jest.fn().mockRejectedValueOnce(new Error('forbidden')).mockResolvedValueOnce('copy')
    const failedCount = await copyAttachments({ addCollection }, [file('a1', 'blob-a'), file('a2', 'blob-b')], ISSUE)
    expect(failedCount).toBe(1)
    expect(addCollection).toHaveBeenCalledTimes(2)
  })
})

describe('postIssueReply', () => {
  it('builds "Created <issue> <title>" with an issue reference', () => {
    expect(JSON.parse(issueReplyMarkup(ISSUE))).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Created ' },
            { type: 'reference', attrs: { id: 'i1', objectclass: 'tracker:class:Issue', label: 'SRV-12' } },
            { type: 'text', text: ' Deploy failed' }
          ]
        }
      ]
    })
  })

  it('replies in the thread of a channel message', async () => {
    const addCollection = jest.fn().mockResolvedValue('reply')
    await postIssueReply({ addCollection }, channelMessage(), ISSUE)
    expect(addCollection).toHaveBeenCalledWith(
      'chunter:class:ThreadMessage',
      'c1',
      'm1',
      'chunter:class:ChatMessage',
      'replies',
      { message: issueReplyMarkup(ISSUE), attachments: 0, objectId: 'c1', objectClass: CHANNEL }
    )
  })

  it('replies to the parent of a thread message', async () => {
    const addCollection = jest.fn().mockResolvedValue('reply')
    await postIssueReply({ addCollection }, threadMessage(), ISSUE)
    expect(addCollection.mock.calls[0].slice(0, 5)).toEqual([
      'chunter:class:ThreadMessage',
      'c1',
      'm1',
      'chunter:class:ChatMessage',
      'replies'
    ])
  })

  it('passes a failed write to the caller', async () => {
    const addCollection = jest.fn().mockRejectedValue(new Error('only owners post'))
    await expect(postIssueReply({ addCollection }, channelMessage(), ISSUE)).rejects.toThrow('only owners post')
  })
})

describe('project memory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('remembers the project per channel', () => {
    rememberProject('c1' as Ref<Doc>, 'p1' as Ref<Project>)
    rememberProject('c2' as Ref<Doc>, 'p2' as Ref<Project>)
    expect(lastProjectFor('c1' as Ref<Doc>)).toBe('p1')
    expect(lastProjectFor('c2' as Ref<Doc>)).toBe('p2')
    expect(lastProjectFor('c3' as Ref<Doc>)).toBeUndefined()
  })

  it('reads a blank stored value as no project', () => {
    localStorage.setItem('servone.createIssue.project.c1', '')
    expect(lastProjectFor('c1' as Ref<Doc>)).toBeUndefined()
  })
})
