import { z } from 'zod'
import { TrackerBundle, parseDate } from '../tracker/bundle'
import { priority, statusCategory } from '../tracker/status'
import type { ApiCall, CommentImport, Connector, Json, PersonRef, ScopeOption, StatusCategory } from '../types'
import { callApi } from './api'

const TEAM_PAGE = 100
const ISSUE_PAGE = 50
const COMMENT_PAGE = 20
const LABEL_PAGE = 20
const EXTRA_COMMENT_PAGE = 100

const STATE_TYPES = new Map<string, StatusCategory>([
  ['triage', 'backlog'],
  ['backlog', 'backlog'],
  ['unstarted', 'todo'],
  ['started', 'inProgress'],
  ['completed', 'done'],
  ['canceled', 'canceled']
])

const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
const user = z.object({ name: z.string(), email: z.string().nullish() }).nullable()

const comment = z.object({ body: z.string(), createdAt: z.string(), user: user.optional() })
const comments = z.object({ nodes: z.array(comment), pageInfo })

const issue = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priority: z.number(),
  estimate: z.number().nullable(),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
  state: z.object({ name: z.string(), type: z.string() }),
  assignee: user,
  creator: user,
  parent: z.object({ identifier: z.string() }).nullable(),
  labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
  comments
})

const teamsResponse = z.object({
  organization: z.object({ name: z.string() }),
  teams: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string() })), pageInfo })
})
const issuesResponse = z.object({
  team: z.object({ name: z.string(), issues: z.object({ nodes: z.array(issue), pageInfo }) })
})
const commentsResponse = z.object({ issue: z.object({ comments }) })
const graphqlResponse = z.object({
  data: z.json().nullish(),
  errors: z.array(z.object({ message: z.string() })).optional()
})

const USER_FIELDS = 'name email'
const COMMENT_FIELDS = `nodes { body createdAt user { ${USER_FIELDS} } } pageInfo { hasNextPage endCursor }`

const TEAMS_QUERY = `query Teams($after: String) {
  organization { name }
  teams(first: ${TEAM_PAGE}, after: $after) { nodes { id name } pageInfo { hasNextPage endCursor } }
}`

const ISSUES_QUERY = `query Issues($team: String!, $after: String) {
  team(id: $team) {
    name
    issues(first: ${ISSUE_PAGE}, after: $after, includeArchived: true) {
      nodes {
        id identifier title description priority estimate dueDate createdAt
        state { name type }
        assignee { ${USER_FIELDS} }
        creator { ${USER_FIELDS} }
        parent { identifier }
        labels(first: ${LABEL_PAGE}) { nodes { name } }
        comments(first: ${COMMENT_PAGE}) { ${COMMENT_FIELDS} }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const COMMENTS_QUERY = `query Comments($issue: String!, $after: String) {
  issue(id: $issue) { comments(first: ${EXTRA_COMMENT_PAGE}, after: $after) { ${COMMENT_FIELDS} } }
}`

async function graphql<T> (api: ApiCall, schema: z.ZodType<T>, query: string, variables: Record<string, Json>, signal: AbortSignal): Promise<T> {
  const response = graphqlResponse.parse(await callApi(api, { method: 'POST', path: '/graphql', body: { query, variables } }, signal))
  if (response.errors !== undefined && response.errors.length > 0) {
    throw new Error(`Linear: ${response.errors.map((error) => error.message).join('; ')}`)
  }
  return schema.parse(response.data)
}

function toPerson (linearUser: z.infer<typeof user> | undefined): PersonRef | undefined {
  if (linearUser === null || linearUser === undefined) return undefined
  return { name: linearUser.name, email: linearUser.email ?? undefined }
}

function toComment (linearComment: z.infer<typeof comment>): CommentImport {
  return { author: toPerson(linearComment.user), date: parseDate(linearComment.createdAt), text: withoutImages(linearComment.body) }
}

function withoutImages (markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) => `[image: ${alt === '' ? 'image' : alt}]`)
}

async function allComments (api: ApiCall, linearIssue: z.infer<typeof issue>, signal: AbortSignal): Promise<Array<z.infer<typeof comment>>> {
  const collected = [...linearIssue.comments.nodes]
  let page = linearIssue.comments.pageInfo
  while (page.hasNextPage) {
    const response = await graphql(api, commentsResponse, COMMENTS_QUERY, { issue: linearIssue.id, after: page.endCursor }, signal)
    collected.push(...response.issue.comments.nodes)
    page = response.issue.comments.pageInfo
  }
  return collected
}

export const linearConnector: Connector = {
  async listScopes (api) {
    const signal = new AbortController().signal
    const scopes: ScopeOption[] = []
    let after: string | null = null
    do {
      const response: z.infer<typeof teamsResponse> = await graphql(api, teamsResponse, TEAMS_QUERY, { after }, signal)
      for (const team of response.teams.nodes) {
        scopes.push({ id: team.id, name: team.name, kind: 'team', parentName: response.organization.name, isSelected: true })
      }
      after = response.teams.pageInfo.hasNextPage ? response.teams.pageInfo.endCursor : null
    } while (after !== null)
    return scopes
  },

  async fetch (api, scopeIds, onProgress, signal) {
    const bundle = new TrackerBundle()
    let estimated = 0
    for (const teamId of scopeIds) {
      let after: string | null = null
      let count = 0
      do {
        const { team }: z.infer<typeof issuesResponse> = await graphql(api, issuesResponse, ISSUES_QUERY, { team: teamId, after }, signal)
        for (const linearIssue of team.issues.nodes) {
          if (linearIssue.estimate !== null) estimated++
          bundle.add(team.name, {
            key: linearIssue.identifier,
            parentKey: linearIssue.parent?.identifier,
            title: linearIssue.title,
            description: withoutImages(linearIssue.description ?? ''),
            status: statusCategory(linearIssue.state.name, STATE_TYPES.get(linearIssue.state.type)),
            sourceStatus: linearIssue.state.name,
            priority: priority(String(linearIssue.priority)),
            assignee: toPerson(linearIssue.assignee),
            creator: toPerson(linearIssue.creator),
            labels: linearIssue.labels.nodes.map((label) => label.name),
            dueDate: linearIssue.dueDate === null ? undefined : parseDate(linearIssue.dueDate),
            createdOn: parseDate(linearIssue.createdAt),
            comments: (await allComments(api, linearIssue, signal))
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .map(toComment)
          })
        }
        count += team.issues.nodes.length
        onProgress({ label: team.name, count })
        after = team.issues.pageInfo.hasNextPage ? team.issues.pageInfo.endCursor : null
      } while (after !== null)
    }
    const imported = bundle.build()
    if (estimated > 0) imported.warnings.push(`Linear estimates are points, not hours, so they were left out: ${estimated} issues`)
    return imported
  }
}
