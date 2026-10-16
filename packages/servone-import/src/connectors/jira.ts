import { z } from 'zod'
import { MS_PER_HOUR, TrackerBundle, parseDate } from '../tracker/bundle'
import { priority, statusCategory } from '../tracker/status'
import type { ApiCall, CommentImport, Connector, PersonRef, ScopeOption, StatusCategory } from '../types'
import { callApi } from './api'
import { adfNode, adfToMarkdown } from './adf'

const MS_PER_SECOND = 1000
const PROJECT_PAGE = 50
const ISSUE_PAGE = 100
const COMMENT_PAGE = 100
const SCOPE_SEPARATOR = '/'
const ISSUE_FIELDS = 'summary,description,status,priority,assignee,reporter,labels,duedate,created,parent,issuetype,timeoriginalestimate,comment'

const STATUS_CATEGORIES = new Map<string, StatusCategory>([
  ['new', 'todo'],
  ['indeterminate', 'inProgress'],
  ['done', 'done']
])

const sitesResponse = z.array(z.object({ id: z.string(), name: z.string(), url: z.string() }))

export type AtlassianSite = z.infer<typeof sitesResponse>[number]

export async function atlassianSites (api: ApiCall, signal: AbortSignal): Promise<AtlassianSite[]> {
  return sitesResponse.parse(await callApi(api, { method: 'GET', path: '/oauth/token/accessible-resources' }, signal))
}

const projectsResponse = z.object({
  values: z.array(z.object({ key: z.string(), name: z.string() })),
  isLast: z.boolean()
})

const user = z.object({ displayName: z.string(), emailAddress: z.string().nullish() }).nullish()

const comment = z.object({ author: user, body: adfNode, created: z.string() })
const commentPage = z.object({ comments: z.array(comment), total: z.number() })

const issuesResponse = z.object({
  issues: z.array(z.object({
    key: z.string(),
    fields: z.object({
      summary: z.string(),
      description: adfNode.nullish(),
      status: z.object({ name: z.string(), statusCategory: z.object({ key: z.string() }) }),
      priority: z.object({ name: z.string() }).nullish(),
      assignee: user,
      reporter: user,
      labels: z.array(z.string()),
      duedate: z.string().nullish(),
      created: z.string(),
      parent: z.object({ key: z.string() }).nullish(),
      issuetype: z.object({ name: z.string() }).nullish(),
      timeoriginalestimate: z.number().nullish(),
      comment: commentPage.nullish()
    })
  })),
  nextPageToken: z.string().nullish()
})

interface JiraProject {
  cloudId: string
  siteName: string
  key: string
  name: string
}

function scopeId (project: JiraProject): string {
  return `${project.cloudId}${SCOPE_SEPARATOR}${project.key}`
}

async function listProjects (api: ApiCall, signal: AbortSignal): Promise<JiraProject[]> {
  const projects: JiraProject[] = []
  for (const site of await atlassianSites(api, signal)) {
    for (let startAt = 0; ; startAt += PROJECT_PAGE) {
      const page = projectsResponse.parse(await callApi(api, {
        method: 'GET',
        path: `/ex/jira/${site.id}/rest/api/3/project/search`,
        query: [['startAt', String(startAt)], ['maxResults', String(PROJECT_PAGE)]]
      }, signal))
      projects.push(...page.values.map((project) => ({ cloudId: site.id, siteName: site.name, key: project.key, name: project.name })))
      if (page.isLast || page.values.length === 0) break
    }
  }
  return projects
}

function jiraDate (text: string): number | undefined {
  return parseDate(text.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
}

function toPerson (jiraUser: z.infer<typeof user>): PersonRef | undefined {
  if (jiraUser === null || jiraUser === undefined) return undefined
  return { name: jiraUser.displayName, email: jiraUser.emailAddress ?? undefined }
}

function toComment (jiraComment: z.infer<typeof comment>): CommentImport {
  return { author: toPerson(jiraComment.author), date: jiraDate(jiraComment.created), text: adfToMarkdown(jiraComment.body) }
}

async function allComments (api: ApiCall, cloudId: string, issueKey: string, embedded: z.infer<typeof commentPage>, signal: AbortSignal): Promise<Array<z.infer<typeof comment>>> {
  if (embedded.comments.length >= embedded.total) return embedded.comments
  const collected: Array<z.infer<typeof comment>> = []
  while (collected.length < embedded.total) {
    const page = commentPage.parse(await callApi(api, {
      method: 'GET',
      path: `/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/comment`,
      query: [['startAt', String(collected.length)], ['maxResults', String(COMMENT_PAGE)], ['orderBy', 'created']]
    }, signal))
    if (page.comments.length === 0) break
    collected.push(...page.comments)
  }
  return collected
}

export const jiraConnector: Connector = {
  async listScopes (api) {
    const projects = await listProjects(api, new AbortController().signal)
    return projects.map((project): ScopeOption => ({
      id: scopeId(project),
      name: project.name,
      kind: 'project',
      parentName: project.siteName,
      isSelected: true
    }))
  },

  async fetch (api, scopeIds, onProgress, signal) {
    const selected = new Set(scopeIds)
    const projects = (await listProjects(api, signal)).filter((project) => selected.has(scopeId(project)))
    const bundle = new TrackerBundle()
    for (const project of projects) {
      let nextPageToken: string | undefined
      let count = 0
      do {
        const query: Array<[string, string]> = [
          ['jql', `project = "${project.key}" ORDER BY created ASC`],
          ['fields', ISSUE_FIELDS],
          ['maxResults', String(ISSUE_PAGE)]
        ]
        if (nextPageToken !== undefined) query.push(['nextPageToken', nextPageToken])
        const page = issuesResponse.parse(await callApi(api, { method: 'GET', path: `/ex/jira/${project.cloudId}/rest/api/3/search/jql`, query }, signal))
        for (const { key, fields } of page.issues) {
          const comments = fields.comment === null || fields.comment === undefined ? [] : await allComments(api, project.cloudId, key, fields.comment, signal)
          const estimateSeconds = fields.timeoriginalestimate ?? 0
          bundle.add(project.name, {
            key,
            parentKey: fields.parent?.key,
            title: fields.summary,
            description: adfToMarkdown(fields.description),
            status: statusCategory(fields.status.name, STATUS_CATEGORIES.get(fields.status.statusCategory.key)),
            sourceStatus: fields.status.name,
            priority: priority(fields.priority?.name ?? ''),
            assignee: toPerson(fields.assignee),
            creator: toPerson(fields.reporter),
            labels: fields.issuetype === null || fields.issuetype === undefined ? fields.labels : [...fields.labels, fields.issuetype.name],
            estimateHours: estimateSeconds > 0 ? (estimateSeconds * MS_PER_SECOND) / MS_PER_HOUR : undefined,
            dueDate: fields.duedate === null || fields.duedate === undefined ? undefined : parseDate(fields.duedate),
            createdOn: jiraDate(fields.created),
            comments: comments.map(toComment)
          })
        }
        count += page.issues.length
        onProgress({ label: project.name, count })
        nextPageToken = page.nextPageToken ?? undefined
      } while (nextPageToken !== undefined)
    }
    return bundle.build()
  }
}
