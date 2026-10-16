import { slackConnector } from '../../connectors/slack'
import type { ApiRequest, ApiResponse, Json } from '../../types'

const users: Json[] = [
  { id: 'U1', name: 'alice', real_name: 'Alice Smith', profile: { email: 'alice@example.com', real_name: 'Alice Smith', display_name: 'ali' } },
  { id: 'U2', name: 'bob', real_name: 'Bob Jones', profile: { real_name: 'Bob Jones', display_name: '' } }
]

const channels: Json[] = [
  { id: 'C1', name: 'general', is_channel: true, is_private: false, is_archived: false, is_member: true, topic: { value: '' }, purpose: { value: 'Company *news*' } },
  { id: 'C2', name: 'secret', is_channel: true, is_private: true, is_archived: false, is_member: true, topic: { value: 'Hush' }, purpose: { value: '' } },
  { id: 'C3', name: 'old', is_channel: true, is_private: false, is_archived: true, is_member: true, topic: { value: '' }, purpose: { value: '' } },
  { id: 'C4', name: 'random', is_channel: true, is_private: false, is_archived: false, is_member: false, topic: { value: '' }, purpose: { value: '' } }
]

const parent = { type: 'message', user: 'U1', text: 'hello <@U2> in <#C4> *now*', ts: '1704067200.000100', thread_ts: '1704067200.000100', reply_count: 2 }
const broadcast = { type: 'message', subtype: 'thread_broadcast', user: 'U2', text: 'shipped', ts: '1704067400.000100', thread_ts: '1704067200.000100' }

function query (request: ApiRequest, name: string): string | undefined {
  return request.query?.find(([key]) => key === name)?.[1]
}

function route (request: ApiRequest): Json {
  const cursor = query(request, 'cursor')
  const channel = query(request, 'channel')
  switch (request.path) {
    case '/api/users.list':
      return cursor === undefined
        ? { ok: true, members: [users[0]], response_metadata: { next_cursor: 'u2' } }
        : { ok: true, members: [users[1]], response_metadata: { next_cursor: '' } }
    case '/api/conversations.list':
      return { ok: true, channels, response_metadata: { next_cursor: '' } }
    case '/api/conversations.history':
      if (channel === 'C4') return { ok: false, error: 'not_in_channel' }
      return cursor === undefined
        ? { ok: true, messages: [broadcast, { type: 'message', subtype: 'channel_join', user: 'U2', text: '<@U2> has joined', ts: '1704067300.000100' }], has_more: true, response_metadata: { next_cursor: 'h2' } }
        : { ok: true, messages: [parent, { type: 'message', user: 'U2', text: 'see file', ts: '1704067500.000100', files: [{ name: 'plan.pdf' }] }], has_more: false }
    case '/api/conversations.replies':
      return { ok: true, messages: [parent, { type: 'message', user: 'U2', text: 'reply', ts: '1704067300.000200', thread_ts: '1704067200.000100' }, broadcast], has_more: false }
    case '/api/conversations.members':
      return { ok: true, members: ['U1', 'U2', 'U9'], response_metadata: { next_cursor: '' } }
  }
  throw new Error(`unexpected ${request.path}`)
}

const api = async (request: ApiRequest): Promise<ApiResponse> => ({ status: 200, body: route(request) })

describe('slackConnector', () => {
  it('lists channels and selects the ones the user is in', async () => {
    const scopes = await slackConnector.listScopes(api)
    expect(scopes.map((scope) => [scope.id, scope.isSelected, scope.parentName])).toEqual([
      ['C1', true, 'Public channels'],
      ['C2', true, 'Private channels'],
      ['C3', false, 'Public channels'],
      ['C4', false, 'Public channels']
    ])
  })

  it('imports history, threads and members, and warns about unreadable channels', async () => {
    const progress = jest.fn()
    const bundle = await slackConnector.fetch(api, ['C1', 'C4'], progress, new AbortController().signal)
    expect(bundle.channels).toHaveLength(1)
    const [general] = bundle.channels
    expect(general).toMatchObject({ name: 'general', topic: 'Company **news**', isPrivate: false, isArchived: false })
    expect(general.members).toEqual([
      { name: 'Alice Smith', email: 'alice@example.com' },
      { name: 'Bob Jones', email: undefined }
    ])
    expect(general.messages).toEqual([
      { key: '1704067200.000100', threadKey: undefined, author: { name: 'Alice Smith', email: 'alice@example.com' }, date: 1704067200000, text: 'hello @Bob Jones in #random **now**' },
      { key: '1704067300.000200', threadKey: '1704067200.000100', author: { name: 'Bob Jones', email: undefined }, date: 1704067300000, text: 'reply' },
      { key: '1704067400.000100', threadKey: '1704067200.000100', author: { name: 'Bob Jones', email: undefined }, date: 1704067400000, text: 'shipped' },
      { key: '1704067500.000100', threadKey: undefined, author: { name: 'Bob Jones', email: undefined }, date: 1704067500000, text: 'see file\n[file: plan.pdf]' }
    ])
    expect(bundle.warnings).toEqual(["Skipped channels the app can't read (join them first): #random", '1 attached files were not imported'])
    expect(progress).toHaveBeenCalledWith({ label: 'general', count: 3 })
  })

  it('throws on other Slack errors', async () => {
    const failing = async (request: ApiRequest): Promise<ApiResponse> =>
      request.path === '/api/users.list' ? { status: 200, body: { ok: false, error: 'invalid_auth' } } : { status: 200, body: route(request) }
    await expect(slackConnector.fetch(failing, ['C1'], jest.fn(), new AbortController().signal)).rejects.toThrow('invalid_auth')
  })
})
