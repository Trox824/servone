import { trelloConnector } from '../../connectors/trello'
import type { ApiRequest, ApiResponse, Json } from '../../types'

const CARD_ID = '65a0f0000000000000000001'
const CARD_CREATED = 0x65a0f000 * 1000

function comment (index: number): Json {
  return {
    id: `act${String(index).padStart(4, '0')}`,
    idMemberCreator: 'm1',
    type: 'commentCard',
    date: new Date(Date.UTC(2024, 0, 2) + (1000 - index) * 1000).toISOString(),
    data: { text: `note ${index}`, card: { id: CARD_ID, name: 'Fix login', idShort: 1, shortLink: 'x' }, board: { id: 'b1' } },
    memberCreator: { id: 'm1', fullName: 'Alice Doe', username: 'alice' }
  }
}

const board = {
  id: 'b1',
  name: 'Roadmap',
  lists: [{ id: 'l1', name: 'Doing', closed: false }, { id: 'l2', name: 'Ideas', closed: false }],
  cards: [
    {
      id: CARD_ID,
      name: 'Fix login',
      desc: 'Users get **logged out**',
      idList: 'l1',
      closed: false,
      due: '2024-03-01T12:00:00.000Z',
      dueComplete: false,
      idMembers: ['m2'],
      labels: [{ id: 'lb1', name: 'bug', color: 'red' }, { id: 'lb2', name: '', color: 'green' }]
    },
    { id: '65a0f0000000000000000002', name: 'Old idea', desc: '', idList: 'l2', closed: true, due: null, dueComplete: false, idMembers: [], labels: [] }
  ],
  members: [{ id: 'm1', fullName: 'Alice Doe', username: 'alice' }, { id: 'm2', fullName: 'Bob Roe', username: 'bob' }],
  checklists: [{ id: 'c1', idCard: CARD_ID, name: 'Steps', checkItems: [{ id: 'i1', name: 'Repro', state: 'complete' }, { id: 'i2', name: 'Patch', state: 'incomplete' }] }],
  labels: [],
  actions: Array.from({ length: 1000 }, (_, index) => comment(index))
}

const olderActions = [
  comment(1000),
  {
    id: 'act9999',
    type: 'createCard',
    date: '2024-01-01T00:00:00.000Z',
    data: { card: { id: CARD_ID, name: 'Fix login' }, list: { id: 'l1' } },
    memberCreator: { id: 'm2', fullName: 'Bob Roe', username: 'bob' }
  }
]

function route (request: ApiRequest): Json {
  const query = new Map(request.query ?? [])
  switch (request.path) {
    case '/1/members/me/boards':
      expect(query.get('filter')).toBe('open')
      return [{ id: 'b1', name: 'Roadmap', idOrganization: 'o1' }, { id: 'b2', name: 'Personal', idOrganization: null }]
    case '/1/members/me/organizations':
      return [{ id: 'o1', displayName: 'Acme' }]
    case '/1/boards/b1':
      expect(query.get('actions_limit')).toBe('1000')
      return board
    case '/1/boards/b1/actions':
      expect(query.get('before')).toBe('act0999')
      return olderActions
    default:
      throw new Error(`Unexpected ${request.method} ${request.path}`)
  }
}

const api = async (request: ApiRequest): Promise<ApiResponse> => ({ status: 200, body: route(request) })

describe('trelloConnector', () => {
  it('lists open boards with their workspace', async () => {
    await expect(trelloConnector.listScopes(api)).resolves.toEqual([
      { id: 'b1', name: 'Roadmap', kind: 'board', parentName: 'Acme', isSelected: true },
      { id: 'b2', name: 'Personal', kind: 'board', parentName: undefined, isSelected: true }
    ])
  })

  it('maps cards and pages comment actions past the first 1000', async () => {
    const bundle = await trelloConnector.fetch(api, ['b1'], () => {}, new AbortController().signal)
    const [card, archived] = bundle.projects[0].issues
    expect(bundle.projects[0].name).toBe('Roadmap')
    expect(card).toMatchObject({
      key: CARD_ID,
      title: 'Fix login',
      description: 'Users get **logged out**\n\n**Steps**\n- [x] Repro\n- [ ] Patch',
      status: 'inProgress',
      sourceStatus: 'Doing',
      assignee: { name: 'Bob Roe' },
      creator: { name: 'Bob Roe' },
      labels: ['bug', 'green'],
      dueDate: Date.parse('2024-03-01T12:00:00.000Z'),
      createdOn: CARD_CREATED
    })
    expect(card.comments).toHaveLength(1001)
    expect(card.comments[0]).toMatchObject({ author: { name: 'Alice Doe' }, text: 'note 1000' })
    expect(card.comments[1000].text).toBe('note 0')
    expect(archived).toMatchObject({ status: 'done', sourceStatus: 'Ideas' })
    expect(bundle.warnings).toEqual([])
  })
})
