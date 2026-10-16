import { z } from 'zod'
import type { ApiCall, CommentImport, Connector, IssueImport, Json, PersonRef, ScopeOption, StatusCategory } from '../types'
import { TrackerBundle, joinBlocks } from '../tracker/bundle'
import { priority, statusCategory } from '../tracker/status'
import { callApi } from './api'
import { htmlToMarkdown } from './html'

const BOARDS_PAGE_LIMIT = 100
const USERS_PAGE_LIMIT = 100
const ITEMS_PAGE_LIMIT = 25
const UPDATES_LIMIT = 50

const DEFAULT_LABELS = new Map<string, StatusCategory>([
  ['working on it', 'inProgress'],
  ['stuck', 'inProgress']
])

const PERSON_FIELDS = 'name email'
const COLUMN_FIELDS = `id type text column { title }
  ... on StatusValue { label is_done }
  ... on PeopleValue { persons_and_teams { id kind } }
  ... on DateValue { date }
  ... on TimelineValue { to }
  ... on TagsValue { tags { name } }`
const UPDATE_FIELDS = `text_body body created_at creator { ${PERSON_FIELDS} }`
const BASE_ITEM_FIELDS = `id name created_at creator { ${PERSON_FIELDS} } group { title }
  column_values { ${COLUMN_FIELDS} }
  updates(limit: ${UPDATES_LIMIT}) { ${UPDATE_FIELDS} replies { ${UPDATE_FIELDS} } }`
const ITEM_FIELDS = `${BASE_ITEM_FIELDS} subitems { ${BASE_ITEM_FIELDS} }`

const BOARDS_QUERY = `query ($page: Int!) {
  boards(limit: ${BOARDS_PAGE_LIMIT}, page: $page, state: active) { id name type workspace { name } }
}`
const USERS_QUERY = `query ($page: Int!) { users(limit: ${USERS_PAGE_LIMIT}, page: $page) { id name email } }`
const FIRST_ITEMS_QUERY = `query ($board: [ID!]) {
  boards(ids: $board) { name items_page(limit: ${ITEMS_PAGE_LIMIT}) { cursor items { ${ITEM_FIELDS} } } }
}`
const NEXT_ITEMS_QUERY = `query ($cursor: String!) {
  next_items_page(limit: ${ITEMS_PAGE_LIMIT}, cursor: $cursor) { cursor items { ${ITEM_FIELDS} } }
}`

const mondayPerson = z.object({ name: z.string().nullish(), email: z.string().nullish() })

const mondayUpdate = z.object({
  text_body: z.string().nullish(),
  body: z.string().nullish(),
  created_at: z.string().nullish(),
  creator: mondayPerson.nullish()
})

const baseItem = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string().nullish(),
  creator: mondayPerson.nullish(),
  group: z.object({ title: z.string() }).nullish(),
  column_values: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      text: z.string().nullish(),
      column: z.object({ title: z.string() }).nullish(),
      label: z.string().nullish(),
      is_done: z.boolean().nullish(),
      persons_and_teams: z.array(z.object({ id: z.string(), kind: z.string() })).nullish(),
      date: z.string().nullish(),
      to: z.string().nullish(),
      tags: z.array(z.object({ name: z.string() })).nullish()
    })
  ),
  updates: z.array(mondayUpdate.extend({ replies: z.array(mondayUpdate).nullish() })).nullish()
})

const mondayItem = baseItem.extend({ subitems: z.array(baseItem).nullish() })

const itemsPage = z.object({ cursor: z.string().nullish(), items: z.array(mondayItem) })

const boardsResponse = z.object({
  boards: z.array(
    z.object({ id: z.string(), name: z.string(), type: z.string().nullish(), workspace: z.object({ name: z.string() }).nullish() })
  )
})
const usersResponse = z.object({ users: z.array(z.object({ id: z.string(), name: z.string(), email: z.string().nullish() })) })
const firstItemsResponse = z.object({ boards: z.array(z.object({ name: z.string(), items_page: itemsPage })) })
const nextItemsResponse = z.object({ next_items_page: itemsPage })
const graphqlErrors = z.object({ errors: z.array(z.object({ message: z.string() })).nullish() })

type BaseItem = z.infer<typeof baseItem>
type MondayPerson = z.infer<typeof mondayPerson>
type MondayUpdate = z.infer<typeof mondayUpdate>

class MondayQueryError extends Error {}

async function graphql<T> (
  api: ApiCall,
  query: string,
  variables: Record<string, Json>,
  schema: z.ZodType<T>,
  signal: AbortSignal
): Promise<T> {
  const body = await callApi(api, { method: 'POST', path: '/v2', body: { query, variables } }, signal)
  const errors = graphqlErrors.parse(body).errors ?? []
  if (errors.length > 0) throw new MondayQueryError(errors.map((error) => error.message).join('; '))
  return z.object({ data: schema }).parse(body).data
}

function toPerson (person: MondayPerson | null | undefined): PersonRef | undefined {
  const name = person?.name ?? undefined
  const email = person?.email ?? undefined
  return name === undefined && email === undefined ? undefined : { name, email }
}

function toComment (update: MondayUpdate, bundle: TrackerBundle): CommentImport {
  return {
    author: toPerson(update.creator),
    date: bundle.date(update.created_at ?? ''),
    text: update.body != null && update.body !== '' ? htmlToMarkdown(update.body) : (update.text_body ?? '').trim()
  }
}

function toIssue (item: BaseItem, parentKey: string | undefined, people: Map<string, PersonRef>, bundle: TrackerBundle): IssueImport {
  const columns = item.column_values
  const isPriority = (title: string | undefined): boolean => /priority/i.test(title ?? '')
  const status = columns.find((column) => column.type === 'status' && !isPriority(column.column?.title))
  const priorityColumn = columns.find((column) => column.type === 'status' && isPriority(column.column?.title))
  const assigneeId = columns
    .find((column) => column.type === 'people')
    ?.persons_and_teams?.find((entry) => entry.kind === 'person')?.id
  const dueColumn = columns.find((column) => column.type === 'date' || column.type === 'timeline')
  const statusLabel = status?.label ?? item.group?.title ?? ''
  const updates = item.updates ?? []
  if (updates.length === UPDATES_LIMIT) bundle.count(`Items with more than ${UPDATES_LIMIT} updates kept only the latest ${UPDATES_LIMIT}`)
  return {
    key: item.id,
    parentKey,
    title: item.name.trim(),
    description: joinBlocks(columns.filter((column) => column.type === 'long_text').map((column) => column.text ?? '')),
    status: statusCategory(statusLabel, status?.is_done === true ? 'done' : DEFAULT_LABELS.get(statusLabel.toLowerCase())),
    sourceStatus: statusLabel,
    priority: priority((priorityColumn?.label ?? '').replace(/[^\p{L}\d ]/gu, '')),
    assignee: assigneeId === undefined ? undefined : people.get(assigneeId),
    creator: toPerson(item.creator),
    labels: [item.group?.title ?? '', ...columns.flatMap((column) => (column.tags ?? []).map((tag) => tag.name))].filter(
      (label) => label !== ''
    ),
    dueDate: bundle.date(dueColumn?.date ?? dueColumn?.to ?? ''),
    createdOn: bundle.date(item.created_at ?? ''),
    comments: [...updates]
      .reverse()
      .flatMap((update) => [update, ...(update.replies ?? [])])
      .map((update) => toComment(update, bundle))
      .filter((comment) => comment.text !== '')
  }
}

async function loadPeople (api: ApiCall, signal: AbortSignal): Promise<Map<string, PersonRef>> {
  const people = new Map<string, PersonRef>()
  for (let page = 1; ; page++) {
    const { users } = await graphql(api, USERS_QUERY, { page }, usersResponse, signal)
    for (const user of users) people.set(user.id, { name: user.name, email: user.email ?? undefined })
    if (users.length < USERS_PAGE_LIMIT) return people
  }
}

export const mondayConnector: Connector = {
  listScopes: async (api) => {
    const signal = new AbortController().signal
    const scopes: ScopeOption[] = []
    for (let page = 1; ; page++) {
      const { boards } = await graphql(api, BOARDS_QUERY, { page }, boardsResponse, signal)
      scopes.push(
        ...boards
          .filter((board) => board.type == null || board.type === 'board')
          .map((board): ScopeOption => ({
            id: board.id,
            name: board.name,
            kind: 'board',
            parentName: board.workspace?.name ?? 'Main workspace',
            isSelected: true
          }))
      )
      if (boards.length < BOARDS_PAGE_LIMIT) return scopes
    }
  },

  fetch: async (api, scopeIds, onProgress, signal) => {
    const bundle = new TrackerBundle()
    const people = await loadPeople(api, signal)
    for (const boardId of scopeIds) {
      const board = (await graphql(api, FIRST_ITEMS_QUERY, { board: [boardId] }, firstItemsResponse, signal)).boards.at(0)
      if (board === undefined) {
        bundle.count('Selected boards that no longer exist were skipped')
        continue
      }
      let page = board.items_page
      let count = 0
      for (;;) {
        for (const item of page.items) {
          bundle.add(board.name, toIssue(item, undefined, people, bundle))
          for (const subitem of item.subitems ?? []) bundle.add(board.name, toIssue(subitem, item.id, people, bundle))
        }
        count += page.items.length
        onProgress({ label: board.name, count })
        if (page.cursor == null) break
        page = (await graphql(api, NEXT_ITEMS_QUERY, { cursor: page.cursor }, nextItemsResponse, signal)).next_items_page
      }
    }
    return bundle.build()
  }
}
