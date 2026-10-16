import { strToU8, zipSync } from 'fflate'
import { parseSlack } from '../slack'

function exportZip (files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, json]) => [path, strToU8(json)])))
}

const json = JSON.stringify

const users = [
  { id: 'U1', name: 'alice', real_name: 'Alice Smith', profile: { email: 'alice@example.com', real_name: 'Alice Smith', display_name: 'ali' } },
  { id: 'U2', name: 'bob', real_name: 'Bob Jones', profile: { email: 'bob@example.com', real_name: 'Bob Jones', display_name: '' } }
]

const channels = [
  { id: 'C1', name: 'general', created: 1, creator: 'U1', is_archived: false, members: ['U1', 'U2', 'U9'], topic: { value: '' }, purpose: { value: 'Company *news*' } }
]

const groups = [
  { id: 'G1', name: 'secret', created: 1, creator: 'U1', is_archived: true, members: ['U1'], topic: { value: 'Hush' }, purpose: { value: '' } }
]

function parse (): ReturnType<typeof parseSlack> {
  const bytes = exportZip({
    'users.json': json(users),
    'channels.json': json(channels),
    'groups.json': json(groups),
    'dms.json': json([{ id: 'D1', members: ['U1', 'U2'] }]),
    'mpims.json': json([{ id: 'M1', name: 'mpdm-a--b--c-1', members: ['U1', 'U2'] }]),
    'general/2024-01-02.json': json([
      { type: 'message', user: 'U2', text: 'reply', ts: '1704153600.000200', thread_ts: '1704067200.000100' },
      { type: 'message', subtype: 'channel_join', user: 'U2', text: '<@U2> has joined the channel', ts: '1704153600.000100' },
      { type: 'message', subtype: 'bot_message', bot_id: 'B1', username: 'deploybot', text: 'Deployed', ts: '1704153600.000300' },
      { type: 'message', subtype: 'file_share', user: 'U1', text: 'see attached', ts: '1704153600.000400', files: [{ name: 'plan.pdf' }, { name: 'shot.png' }] }
    ]),
    'general/2024-01-01.json': json([
      { type: 'message', user: 'U1', text: 'hello <@U2> and <@U1|alice> in <#C1|general> <!here>', ts: '1704067200.000100', thread_ts: '1704067200.000100' },
      { type: 'message', subtype: 'channel_topic', user: 'U1', text: 'set the topic', ts: '1704067200.000050' }
    ]),
    'secret/2024-01-01.json': json([
      { type: 'message', user: 'U1', text: 'psst', ts: '1704067300.000100' }
    ]),
    'D1/2024-01-01.json': json([{ type: 'message', user: 'U1', text: 'dm', ts: '1704067200.000900' }])
  })
  return parseSlack({ name: 'slack.zip', bytes })
}

describe('parseSlack', () => {
  it('imports public and private channels with members and topics', () => {
    const bundle = parse()
    expect(bundle.projects).toEqual([])
    expect(bundle.teamspaces).toEqual([])
    expect(bundle.channels.map((channel) => channel.name)).toEqual(['general', 'secret'])
    const [general, secret] = bundle.channels
    expect(general.isPrivate).toBe(false)
    expect(general.isArchived).toBe(false)
    expect(general.topic).toBe('Company **news**')
    expect(general.members).toEqual([
      { name: 'Alice Smith', email: 'alice@example.com' },
      { name: 'Bob Jones', email: 'bob@example.com' }
    ])
    expect(secret.isPrivate).toBe(true)
    expect(secret.isArchived).toBe(true)
    expect(secret.topic).toBe('Hush')
    expect(secret.messages.map((message) => message.text)).toEqual(['psst'])
  })

  it('keeps chat messages in order, skips system events and links threads', () => {
    const general = parse().channels[0]
    expect(general.messages.map((message) => message.key)).toEqual([
      '1704067200.000100',
      '1704153600.000200',
      '1704153600.000300',
      '1704153600.000400'
    ])
    const [root, reply, bot, share] = general.messages
    expect(root.threadKey).toBeUndefined()
    expect(root.date).toBe(1704067200000)
    expect(root.author).toEqual({ name: 'Alice Smith', email: 'alice@example.com' })
    expect(root.text).toBe('hello @Bob Jones and @ali in #general @here')
    expect(reply.threadKey).toBe('1704067200.000100')
    expect(bot.author).toEqual({ name: 'deploybot' })
    expect(share.text).toBe('see attached\n[file: plan.pdf]\n[file: shot.png]')
  })

  it('warns about skipped conversations and files', () => {
    expect(parse().warnings).toEqual([
      'Skipped 2 direct and group direct message conversations',
      '2 attached files were not imported'
    ])
  })

  it('converts mrkdwn to markdown outside code', () => {
    const bytes = exportZip({
      'users.json': json(users),
      'channels.json': json([{ ...channels[0], members: [] }]),
      'general/2024-01-01.json': json([
        {
          type: 'message',
          user: 'U1',
          text: '*bold* _italic_ ~gone~ <https://x.com/a_b_c|the *docs*> <https://y.com> &lt;tag&gt; &amp; snake_case_name `*not* &lt;b&gt;`\n```\n_keep_ *this*\n```',
          ts: '1704067200.000100'
        }
      ])
    })
    const [message] = parseSlack({ name: 'slack.zip', bytes }).channels[0].messages
    expect(message.text).toBe(
      '**bold** *italic* ~~gone~~ [the *docs*](https://x.com/a_b_c) https://y.com <tag> & snake_case_name `*not* <b>`\n```\n_keep_ *this*\n```'
    )
  })
})
