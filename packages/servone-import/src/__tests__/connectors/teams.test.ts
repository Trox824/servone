import { teamsConnector } from '../../connectors/teams'
import type { ApiCall, ApiRequest, ApiResponse, Json } from '../../types'

const ALPHA = 'team-a'
const BETA = 'team-b'
const GENERAL_A = '19:a@thread.tacv2'
const GENERAL_B = '19:b@thread.tacv2'
const ALPHA_GENERAL = `/v1.0/teams/${ALPHA}/channels/${GENERAL_A}`
const BETA_GENERAL = `/v1.0/teams/${BETA}/channels/${GENERAL_B}`

const ana = { '@odata.type': '#microsoft.graph.teamworkUserIdentity', id: 'u1', displayName: 'Ana Silva', userIdentityType: 'aadUser' }
const bo = { '@odata.type': '#microsoft.graph.teamworkUserIdentity', id: 'u2', displayName: 'Bo Chen', userIdentityType: 'aadUser' }
const guest = { '@odata.type': '#microsoft.graph.teamworkUserIdentity', id: 'u3', displayName: 'Guest Gil', userIdentityType: 'aadUser' }

function message (id: string, from: Json, content: string, minute: number, extra: Record<string, Json> = {}): Json {
  return {
    id,
    replyToId: null,
    etag: id,
    messageType: 'message',
    createdDateTime: `2026-01-02T10:${String(minute).padStart(2, '0')}:00.000Z`,
    deletedDateTime: null,
    subject: null,
    importance: 'normal',
    from,
    body: { contentType: 'html', content },
    attachments: [],
    mentions: [],
    reactions: [],
    ...extra
  }
}

const userFrom = (user: Json): Json => ({ application: null, device: null, user })
const list = (value: Json[], next?: string): Json => next === undefined ? { value } : { value, '@odata.nextLink': next }

function answer (request: ApiRequest): ApiResponse {
  const ok = (body: Json): ApiResponse => ({ status: 200, body })
  const skip = request.query?.find(([key]) => key === '$skiptoken')?.[1]
  switch (request.path) {
    case '/v1.0/me/joinedTeams':
      return ok(list([{ id: ALPHA, displayName: 'Alpha', description: '' }, { id: BETA, displayName: 'Beta', description: '' }]))
    case `/v1.0/teams/${ALPHA}/channels`:
      return ok(list([
        { id: GENERAL_A, displayName: 'General', description: 'Team chat', membershipType: 'standard', isArchived: false },
        { id: '19:p@thread.tacv2', displayName: 'Leads', description: null, membershipType: 'private', isArchived: false }
      ]))
    case `/v1.0/teams/${BETA}/channels`:
      return ok(list([{ id: GENERAL_B, displayName: 'General', description: null, membershipType: 'standard' }]))
    case `${ALPHA_GENERAL}/members`:
      return ok(list([{ '@odata.type': '#microsoft.graph.aadUserConversationMember', id: 'm1', roles: ['owner'], displayName: 'Ana Silva', userId: 'u1', email: 'ana@acme.io' }]))
    case `${BETA_GENERAL}/members`:
      return { status: 403, body: { error: { code: 'Forbidden', message: 'Insufficient privileges' } } }
    case `${ALPHA_GENERAL}/messages`:
      return skip === undefined
        ? ok(list([
          message('1001', userFrom(ana), '<p>Hello <at id="0">Bo Chen</at> <emoji id="smile" alt="🙂" title="Smile"></emoji></p>', 1, { subject: 'Kickoff' }),
          message('1002', null, '<systemEventMessage/>', 2, { messageType: 'systemEventMessage', body: { contentType: 'html', content: '<systemEventMessage/>' } })
        ], `https://graph.microsoft.com/v1.0/teams/${ALPHA}/channels/${GENERAL_A}/messages?$top=50&$skiptoken=next1`))
        : ok(list([message('1003', { application: { id: 'app', displayName: 'Deploy Bot' }, device: null, user: null }, 'Deployed', 3, { body: { contentType: 'text', content: 'Deployed' } })]))
    case `${ALPHA_GENERAL}/messages/1001/replies`:
      return ok(list([
        message('1004', userFrom(bo), '<div>See file<attachment id="f1"></attachment></div>', 4, { replyToId: '1001', attachments: [{ id: 'f1', contentType: 'reference', contentUrl: 'https://x', name: 'plan.pdf' }] }),
        message('1005', userFrom(bo), '', 5, { replyToId: '1001', deletedDateTime: '2026-01-03T00:00:00Z' })
      ]))
    case `${ALPHA_GENERAL}/messages/1002/replies`:
    case `${ALPHA_GENERAL}/messages/1003/replies`:
    case `${BETA_GENERAL}/messages/2001/replies`:
      return ok(list([]))
    case `${BETA_GENERAL}/messages`:
      return ok(list([message('2001', userFrom(guest), '<p>Hi from Beta</p>', 6)]))
    case '/v1.0/users/u2':
      return ok({ mail: 'bo@acme.io', userPrincipalName: 'bo@acme.io' })
    case '/v1.0/users/u3':
      return { status: 404, body: { error: { code: 'Request_ResourceNotFound' } } }
    default:
      throw new Error(`unexpected ${request.path}`)
  }
}

describe('teamsConnector', () => {
  it('lists channels with their team, preselecting standard ones', async () => {
    const api: ApiCall = async (request) => answer(request)
    await expect(teamsConnector.listScopes(api)).resolves.toEqual([
      { id: `${ALPHA}/${GENERAL_A}`, name: 'General', kind: 'channel', parentName: 'Alpha', isSelected: true },
      { id: `${ALPHA}/19:p@thread.tacv2`, name: 'Leads', kind: 'channel', parentName: 'Alpha', isSelected: false },
      { id: `${BETA}/${GENERAL_B}`, name: 'General', kind: 'channel', parentName: 'Beta', isSelected: true }
    ])
  })

  it('pages messages, threads replies, and resolves emails', async () => {
    const api = jest.fn(async (request: ApiRequest) => answer(request))
    const progress = jest.fn()
    const bundle = await teamsConnector.fetch(api, [`${ALPHA}/${GENERAL_A}`, `${BETA}/${GENERAL_B}`], progress, new AbortController().signal)
    expect(progress).toHaveBeenCalledWith({ label: 'General', count: 3 })
    const [alpha, beta] = bundle.channels
    expect(alpha).toEqual({
      name: 'Alpha - General',
      topic: 'Team chat',
      isPrivate: false,
      isArchived: false,
      members: [{ name: 'Ana Silva', email: 'ana@acme.io' }],
      messages: [
        { key: '1001', threadKey: undefined, author: { name: 'Ana Silva', email: 'ana@acme.io' }, date: Date.UTC(2026, 0, 2, 10, 1), text: '**Kickoff**\n\nHello @Bo Chen 🙂' },
        { key: '1003', threadKey: undefined, author: { name: 'Deploy Bot' }, date: Date.UTC(2026, 0, 2, 10, 3), text: 'Deployed' },
        { key: '1004', threadKey: '1001', author: { name: 'Bo Chen', email: 'bo@acme.io' }, date: Date.UTC(2026, 0, 2, 10, 4), text: 'See file\n\n[file: plan.pdf]' }
      ]
    })
    expect(beta).toMatchObject({ name: 'Beta - General', members: [{ name: 'Guest Gil', email: undefined }] })
    expect(api.mock.calls.filter(([request]) => request.path === '/v1.0/users/u1')).toHaveLength(0)
    expect(bundle.warnings).toEqual([
      '1 attached files and images were not imported',
      'Member lists of 1 channels could not be read, so message authors were added as members'
    ])
  })
})
