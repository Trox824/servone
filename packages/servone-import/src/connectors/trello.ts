import { z } from 'zod'
import type { ApiCall, Connector, ScopeOption } from '../types'
import { TrackerBundle } from '../tracker/bundle'
import { addTrelloBoard } from '../tracker/trello'
import { callApi } from './api'

const ACTIONS_LIMIT = 1000
const ACTION_FILTER = 'commentCard,createCard'

const boardList = z.array(z.object({ id: z.string(), name: z.string(), idOrganization: z.string().nullish() }))

const organizationList = z.array(z.object({ id: z.string(), displayName: z.string() }))

const trelloAction = z.object({
  id: z.string(),
  type: z.string(),
  date: z.string(),
  data: z.object({ card: z.object({ id: z.string() }).nullish(), text: z.string().nullish() }),
  memberCreator: z.object({ fullName: z.string() }).nullish()
})

const trelloBoard = z.object({
  name: z.string(),
  lists: z.array(z.object({ id: z.string(), name: z.string() })),
  cards: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      desc: z.string(),
      idList: z.string(),
      closed: z.boolean(),
      due: z.string().nullish(),
      dueComplete: z.boolean(),
      idMembers: z.array(z.string()),
      labels: z.array(z.object({ name: z.string(), color: z.string().nullish() }))
    })
  ),
  members: z.array(z.object({ id: z.string(), fullName: z.string() })),
  checklists: z.array(
    z.object({ idCard: z.string(), name: z.string(), checkItems: z.array(z.object({ name: z.string(), state: z.string() })) })
  ),
  actions: z.array(trelloAction)
})

type TrelloAction = z.infer<typeof trelloAction>

async function boardActions (api: ApiCall, boardId: string, first: TrelloAction[], signal: AbortSignal): Promise<TrelloAction[]> {
  const actions = [...first]
  let oldest = first.length === ACTIONS_LIMIT ? first.at(-1) : undefined
  while (oldest !== undefined) {
    const page = z.array(trelloAction).parse(
      await callApi(api, {
        method: 'GET',
        path: `/1/boards/${boardId}/actions`,
        query: [['filter', ACTION_FILTER], ['limit', String(ACTIONS_LIMIT)], ['before', oldest.id]]
      }, signal)
    )
    actions.push(...page)
    oldest = page.length === ACTIONS_LIMIT ? page.at(-1) : undefined
  }
  return actions
}

export const trelloConnector: Connector = {
  listScopes: async (api) => {
    const signal = new AbortController().signal
    const boards = boardList.parse(
      await callApi(api, { method: 'GET', path: '/1/members/me/boards', query: [['filter', 'open'], ['fields', 'name,idOrganization']] }, signal)
    )
    const organizations = organizationList.parse(
      await callApi(api, { method: 'GET', path: '/1/members/me/organizations', query: [['fields', 'displayName']] }, signal)
    )
    const workspaceNames = new Map(organizations.map((organization) => [organization.id, organization.displayName]))
    return boards.map((board): ScopeOption => ({
      id: board.id,
      name: board.name,
      kind: 'board',
      parentName: workspaceNames.get(board.idOrganization ?? ''),
      isSelected: true
    }))
  },

  fetch: async (api, scopeIds, onProgress, signal) => {
    const bundle = new TrackerBundle()
    for (const boardId of scopeIds) {
      const board = trelloBoard.parse(
        await callApi(api, {
          method: 'GET',
          path: `/1/boards/${boardId}`,
          query: [
            ['fields', 'name'],
            ['lists', 'all'],
            ['cards', 'all'],
            ['checklists', 'all'],
            ['labels', 'all'],
            ['members', 'all'],
            ['actions', ACTION_FILTER],
            ['actions_limit', String(ACTIONS_LIMIT)]
          ]
        }, signal)
      )
      addTrelloBoard(bundle, board.name, { ...board, actions: await boardActions(api, boardId, board.actions, signal) })
      onProgress({ label: board.name, count: board.cards.length })
    }
    return bundle.build()
  }
}
