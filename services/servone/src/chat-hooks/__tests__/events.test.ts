import chunter from '@hcengineering/chunter'
import { markupHasMentions, readChatEvent } from '../events'
import {
  ANA,
  CHANNEL,
  CHANNEL_MENTION,
  DM,
  editedOnly,
  editMessage,
  HERE_MENTION,
  ISSUE_REFERENCE,
  MESSAGE,
  PERSON_MENTION,
  postMessage,
  postReply,
  react,
  removeMessage,
  REPLY,
  TEAM_MENTION,
  text
} from './fixtures'

describe('readChatEvent', () => {
  it('reads a channel message as message.posted', () => {
    const tx = postMessage(text('Deploy failed'))
    expect(readChatEvent(tx)).toEqual({
      name: 'message.posted',
      tx: tx._id,
      channel: CHANNEL,
      message: MESSAGE,
      messageClass: chunter.class.ChatMessage,
      threadParent: null,
      markup: text('Deploy failed'),
      hasMentions: false,
      isIntegration: false,
      actor: ANA,
      emoji: null,
      occurredAt: 1_000
    })
  })

  it('reads a channel thread reply as thread.reply with its parent', () => {
    expect(readChatEvent(postReply(text('On it')))).toMatchObject({
      name: 'thread.reply',
      message: REPLY,
      messageClass: chunter.class.ThreadMessage,
      threadParent: MESSAGE
    })
  })

  it('reads an edit of either message class as message.updated', () => {
    expect(readChatEvent(editMessage(text('fixed')))).toMatchObject({ name: 'message.updated', message: MESSAGE, markup: text('fixed') })
    expect(readChatEvent(editMessage(text('fixed'), chunter.class.ThreadMessage))).toMatchObject({
      name: 'message.updated',
      message: REPLY,
      messageClass: chunter.class.ThreadMessage
    })
  })

  it('ignores an update that does not change the text', () => {
    expect(readChatEvent(editedOnly())).toBeUndefined()
  })

  it('reads a removal of either class as message.deleted, with ids only', () => {
    expect(readChatEvent(removeMessage())).toMatchObject({ name: 'message.deleted', message: MESSAGE, markup: null })
    expect(readChatEvent(removeMessage(chunter.class.ThreadMessage))).toMatchObject({ name: 'message.deleted', message: REPLY })
  })

  it('reads a reaction on a channel message as reaction.added', () => {
    expect(readChatEvent(react('👍'))).toMatchObject({
      name: 'reaction.added',
      message: MESSAGE,
      messageClass: chunter.class.ChatMessage,
      emoji: '👍',
      actor: ANA,
      markup: null
    })
  })

  it('ignores direct messages', () => {
    expect(readChatEvent(postMessage(text('hi'), DM))).toBeUndefined()
    expect(readChatEvent(postReply(text('hi'), chunter.class.DirectMessage))).toBeUndefined()
  })

  it('ignores unrelated classes', () => {
    const reaction = react('👍')
    const onIssue = { ...reaction, attachedToClass: 'tracker:class:Issue' as typeof reaction.attachedToClass }
    expect(readChatEvent(onIssue)).toBeUndefined()
    const channelCreate = { ...postMessage(text('x')), objectClass: chunter.class.Channel }
    expect(readChatEvent(channelCreate)).toBeUndefined()
  })

  it('marks a webhook message as an integration message', () => {
    expect(readChatEvent(postMessage(text('build ok'), CHANNEL, { servoneWebhookName: 'CI' }))?.isIntegration).toBe(true)
  })

  it('marks a webhook reply as an integration message', () => {
    expect(readChatEvent(postReply(text('build ok'), chunter.class.Channel, { servoneWebhookName: 'CI' }))?.isIntegration).toBe(true)
  })

  it('sees mentions in the new text', () => {
    expect(readChatEvent(postMessage(PERSON_MENTION))?.hasMentions).toBe(true)
    expect(readChatEvent(editMessage(TEAM_MENTION))?.hasMentions).toBe(true)
  })
})

describe('markupHasMentions', () => {
  it.each([
    ['a person', PERSON_MENTION, true],
    ['a team', TEAM_MENTION, true],
    ['@here', HERE_MENTION, true],
    ['@channel', CHANNEL_MENTION, true],
    ['an issue reference', ISSUE_REFERENCE, false],
    ['no mention', text('plain'), false]
  ])('%s', (_label, markup, expected) => {
    expect(markupHasMentions(markup)).toBe(expected)
  })
})
