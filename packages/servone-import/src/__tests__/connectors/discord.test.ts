import { discordConnector } from '../../connectors/discord'
import type { ApiRequest, ApiResponse, Json } from '../../types'

const BASE_MS = Date.UTC(2024, 0, 1)
const alice = { id: '11', username: 'alice', global_name: 'Alice Smith' }
const bob = { id: '12', username: 'bob', global_name: null }

const channels: Json[] = [
  { id: 'CAT', type: 4, name: 'Work', parent_id: null, position: 0 },
  { id: 'G', type: 0, name: 'general', parent_id: 'CAT', position: 2, topic: 'Daily chat' },
  { id: '77', type: 5, name: 'news', parent_id: null, position: 1, topic: null },
  { id: 'V', type: 2, name: 'voice', parent_id: 'CAT', position: 3 },
  { id: 'L', type: 0, name: 'locked', parent_id: null, position: 4 }
]

function message (id: number, overrides: Record<string, Json> = {}): Json {
  return { id: String(id), type: 0, content: `m${id}`, timestamp: new Date(BASE_MS + id * 1000).toISOString(), author: bob, mentions: [], attachments: [], ...overrides }
}

const firstPage = Array.from({ length: 100 }, (_, index) => message(1100 - index))
const secondPage = [
  message(1000, { author: alice, content: 'hi <@!12> see <#77> <:party:123>', mentions: [bob], attachments: [{ filename: 'shot.png', content_type: 'image/png' }, { filename: 'plan.pdf' }] }),
  message(999, { type: 7, content: '' })
]

function query (request: ApiRequest, name: string): string | undefined {
  return request.query?.find(([key]) => key === name)?.[1]
}

function route (request: ApiRequest): ApiResponse {
  const ok = (body: Json): ApiResponse => ({ status: 200, body })
  switch (request.path) {
    case '/api/v10/guilds/{guild}/channels':
      return ok(channels)
    case '/api/v10/guilds/{guild}/threads/active':
      return ok({ threads: [{ id: '1000', type: 11, name: 'Plan', parent_id: 'G' }, { id: 'X', type: 11, name: 'Other', parent_id: '77' }], members: [] })
    case '/api/v10/channels/G/threads/archived/public':
      return query(request, 'before') === undefined
        ? ok({ threads: [{ id: '5000', type: 11, name: 'Old', parent_id: 'G', thread_metadata: { archived: true, archive_timestamp: '2024-02-01T00:00:00.000Z' } }], members: [], has_more: true })
        : ok({ threads: [], members: [], has_more: false })
    case '/api/v10/channels/G/messages':
      return ok(query(request, 'before') === '1001' ? secondPage : firstPage)
    case '/api/v10/channels/1000/messages':
      return ok([message(1500, { content: 'thread reply' }), message(1000, { type: 21, content: '' })])
    case '/api/v10/channels/5000/messages':
      return ok([message(5002, { content: 'second' }), message(5001, { author: alice, content: 'first' })])
    case '/api/v10/channels/L/messages':
      return { status: 403, body: { message: 'Missing Access', code: 50001 } }
  }
  throw new Error(`unexpected ${request.path}`)
}

const api = async (request: ApiRequest): Promise<ApiResponse> => route(request)

describe('discordConnector', () => {
  it('lists text and announcement channels with their category', async () => {
    const scopes = await discordConnector.listScopes(api)
    expect(scopes).toEqual([
      { id: '77', name: 'news', kind: 'channel', parentName: undefined, isSelected: true },
      { id: 'G', name: 'general', kind: 'channel', parentName: 'Work', isSelected: true },
      { id: 'L', name: 'locked', kind: 'channel', parentName: undefined, isSelected: true }
    ])
  })

  it('pages messages, threads replies and warns about unreadable channels', async () => {
    const bundle = await discordConnector.fetch(api, ['G', 'L'], jest.fn(), new AbortController().signal)
    expect(bundle.channels).toHaveLength(1)
    const [general] = bundle.channels
    expect(general.topic).toBe('Daily chat')
    expect(general.members).toEqual([{ name: 'Alice Smith' }, { name: 'bob' }])
    expect(general.messages).toHaveLength(104)
    expect(general.messages[0]).toEqual({
      key: '1000',
      threadKey: undefined,
      author: { name: 'Alice Smith' },
      date: BASE_MS + 1000 * 1000,
      text: 'hi @bob see #news :party:\n[image: shot.png]\n[file: plan.pdf]'
    })
    expect(general.messages.find((imported) => imported.key === '1500')?.threadKey).toBe('1000')
    expect(general.messages.slice(-2).map((imported) => [imported.key, imported.threadKey])).toEqual([['5001', undefined], ['5002', '5001']])
    expect(bundle.warnings).toEqual(["Skipped channels the bot can't read: #locked", '2 attached files were not imported'])
  })
})
