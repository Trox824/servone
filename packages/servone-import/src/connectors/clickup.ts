import { z } from 'zod'
import type { ApiCall, CommentImport, Connector, PersonRef, ScopeOption, StatusCategory } from '../types'
import { MS_PER_HOUR, TrackerBundle, checklistMarkdown, joinBlocks } from '../tracker/bundle'
import { matchStatus, priority, statusCategory } from '../tracker/status'
import { callApi } from './api'

const COMMENT_PAGE_SIZE = 25
const TASK_PAGE_SIZE = 100

const clickupUser = z.object({ username: z.string().nullish(), email: z.string().nullish() })

const teamList = z.object({ teams: z.array(z.object({ id: z.string(), name: z.string() })) })

const spaceList = z.object({ spaces: z.array(z.object({ id: z.string(), name: z.string() })) })

const taskPage = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      markdown_description: z.string().nullish(),
      text_content: z.string().nullish(),
      status: z.object({ status: z.string(), type: z.string() }),
      priority: z.object({ priority: z.string() }).nullish(),
      assignees: z.array(clickupUser).nullish(),
      creator: clickupUser.nullish(),
      tags: z.array(z.object({ name: z.string() })).nullish(),
      time_estimate: z.number().nullish(),
      due_date: z.string().nullish(),
      date_created: z.string().nullish(),
      parent: z.string().nullish(),
      checklists: z
        .array(z.object({ name: z.string(), items: z.array(z.object({ name: z.string(), resolved: z.boolean() })) }))
        .nullish()
    })
  ),
  last_page: z.boolean().optional()
})

const commentPage = z.object({
  comments: z.array(
    z.object({
      id: z.string(),
      comment_text: z.string(),
      date: z.string(),
      user: clickupUser.nullish(),
      reply_count: z.coerce.number().optional()
    })
  )
})

type ClickupUser = z.infer<typeof clickupUser>
type ClickupTask = z.infer<typeof taskPage>['tasks'][number]
type ClickupComment = z.infer<typeof commentPage>['comments'][number]

interface SpaceScope {
  teamId: string
  teamName: string
  id: string
  name: string
}

const STATUS_TYPES = new Map<string, StatusCategory>([
  ['open', 'todo'],
  ['closed', 'done'],
  ['done', 'done']
])

function toPerson (user: ClickupUser | null | undefined): PersonRef | undefined {
  const name = user?.username ?? undefined
  const email = user?.email ?? undefined
  return name === undefined && email === undefined ? undefined : { name, email }
}

function taskStatus (status: { status: string, type: string }): StatusCategory {
  const known = STATUS_TYPES.get(status.type)
  return known === undefined ? matchStatus(status.status) ?? 'inProgress' : statusCategory(status.status, known)
}

async function listSpaces (api: ApiCall, signal: AbortSignal): Promise<SpaceScope[]> {
  const { teams } = teamList.parse(await callApi(api, { method: 'GET', path: '/api/v2/team' }, signal))
  const scopes: SpaceScope[] = []
  for (const team of teams) {
    const { spaces } = spaceList.parse(
      await callApi(api, { method: 'GET', path: `/api/v2/team/${team.id}/space`, query: [['archived', 'false']] }, signal)
    )
    scopes.push(...spaces.map((space) => ({ teamId: team.id, teamName: team.name, id: space.id, name: space.name })))
  }
  return scopes
}

async function commentThread (api: ApiCall, path: string, signal: AbortSignal): Promise<ClickupComment[]> {
  const comments = new Map<string, ClickupComment>()
  let query: Array<[string, string]> = []
  for (;;) {
    const page = commentPage.parse(await callApi(api, { method: 'GET', path, query }, signal)).comments
    const fresh = page.filter((comment) => !comments.has(comment.id))
    for (const comment of fresh) comments.set(comment.id, comment)
    const oldest = page.at(-1)
    if (page.length < COMMENT_PAGE_SIZE || fresh.length === 0 || oldest === undefined) break
    query = [['start', oldest.date], ['start_id', oldest.id]]
  }
  return [...comments.values()].reverse()
}

async function taskComments (api: ApiCall, taskId: string, bundle: TrackerBundle, signal: AbortSignal): Promise<CommentImport[]> {
  const comments: CommentImport[] = []
  for (const comment of await commentThread(api, `/api/v2/task/${taskId}/comment`, signal)) {
    const replies = (comment.reply_count ?? 0) > 0 ? await commentThread(api, `/api/v2/comment/${comment.id}/reply`, signal) : []
    for (const entry of [comment, ...replies]) {
      if (entry.comment_text.trim() === '') continue
      comments.push({ author: toPerson(entry.user), date: bundle.date(entry.date), text: entry.comment_text.trim() })
    }
  }
  return comments
}

export const clickupConnector: Connector = {
  listScopes: async (api) => {
    const spaces = await listSpaces(api, new AbortController().signal)
    return spaces.map((space): ScopeOption => ({
      id: space.id,
      name: space.name,
      kind: 'space',
      parentName: space.teamName,
      isSelected: true
    }))
  },

  fetch: async (api, scopeIds, onProgress, signal) => {
    const bundle = new TrackerBundle()
    const selected = new Set(scopeIds)
    for (const space of (await listSpaces(api, signal)).filter((scope) => selected.has(scope.id))) {
      const tasks: ClickupTask[] = []
      for (let pageNumber = 0; ; pageNumber++) {
        const page = taskPage.parse(
          await callApi(api, {
            method: 'GET',
            path: `/api/v2/team/${space.teamId}/task`,
            query: [
              ['space_ids[]', space.id],
              ['subtasks', 'true'],
              ['include_closed', 'true'],
              ['include_markdown_description', 'true'],
              ['page', String(pageNumber)]
            ]
          }, signal)
        )
        tasks.push(...page.tasks)
        onProgress({ label: space.name, count: tasks.length })
        if (page.last_page ?? page.tasks.length < TASK_PAGE_SIZE) break
      }
      for (const [index, task] of tasks.entries()) {
        const checklists = (task.checklists ?? []).map((checklist) =>
          checklistMarkdown(checklist.name, checklist.items.map((check) => ({ text: check.name, isDone: check.resolved })))
        )
        const estimateMs = task.time_estimate ?? 0
        bundle.add(space.name, {
          key: task.id,
          parentKey: task.parent ?? undefined,
          title: task.name.trim(),
          description: joinBlocks([task.markdown_description ?? task.text_content ?? '', ...checklists]),
          status: taskStatus(task.status),
          sourceStatus: task.status.status,
          priority: priority(task.priority?.priority ?? ''),
          assignee: toPerson(task.assignees?.[0]),
          creator: toPerson(task.creator),
          labels: (task.tags ?? []).map((tag) => tag.name),
          estimateHours: estimateMs > 0 ? estimateMs / MS_PER_HOUR : undefined,
          dueDate: bundle.date(task.due_date ?? ''),
          createdOn: bundle.date(task.date_created ?? ''),
          comments: await taskComments(api, task.id, bundle, signal)
        })
        onProgress({ label: `${space.name} comments`, count: index + 1 })
      }
    }
    return bundle.build()
  }
}
