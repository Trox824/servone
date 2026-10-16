import { z } from 'zod'
import type { ApiCall, CommentImport, Connector, IssueImport, PersonRef, Priority, ScopeOption } from '../types'
import { TrackerBundle } from '../tracker/bundle'
import { priority, statusCategory } from '../tracker/status'
import { callApi } from './api'
import { htmlToMarkdown } from './html'

const PAGE_LIMIT = '100'

const TASK_FIELDS = [
  'name',
  'notes',
  'html_notes',
  'completed',
  'assignee.name',
  'assignee.email',
  'created_by.name',
  'created_by.email',
  'tags.name',
  'due_on',
  'due_at',
  'created_at',
  'num_subtasks',
  'memberships.project.gid',
  'memberships.section.name',
  'custom_fields.name',
  'custom_fields.display_value'
].join(',')

const STORY_FIELDS = 'resource_subtype,text,created_at,created_by.name,created_by.email'

const asanaUser = z.object({ name: z.string().nullish(), email: z.string().nullish() })

const named = z.object({ gid: z.string(), name: z.string() })

const asanaTask = z.object({
  gid: z.string(),
  name: z.string(),
  notes: z.string().nullish(),
  html_notes: z.string().nullish(),
  completed: z.boolean(),
  assignee: asanaUser.nullish(),
  created_by: asanaUser.nullish(),
  tags: z.array(z.object({ name: z.string() })).nullish(),
  due_on: z.string().nullish(),
  due_at: z.string().nullish(),
  created_at: z.string().nullish(),
  num_subtasks: z.number().nullish(),
  memberships: z
    .array(z.object({ project: z.object({ gid: z.string() }).nullish(), section: z.object({ name: z.string() }).nullish() }))
    .nullish(),
  custom_fields: z.array(z.object({ name: z.string(), display_value: z.string().nullish() })).nullish()
})

const asanaStory = z.object({
  resource_subtype: z.string(),
  text: z.string().nullish(),
  created_at: z.string(),
  created_by: asanaUser.nullish()
})

type AsanaUser = z.infer<typeof asanaUser>
type AsanaTask = z.infer<typeof asanaTask>

function toPerson (user: AsanaUser | null | undefined): PersonRef | undefined {
  const name = user?.name ?? undefined
  const email = user?.email ?? undefined
  return name === undefined && email === undefined ? undefined : { name, email }
}

async function listAll<T> (
  api: ApiCall,
  path: string,
  query: Array<[string, string]>,
  item: z.ZodType<T>,
  signal: AbortSignal
): Promise<T[]> {
  const pageSchema = z.object({ data: z.array(item), next_page: z.object({ offset: z.string() }).nullish() })
  const items: T[] = []
  let offset: string | undefined
  do {
    const pageQuery: Array<[string, string]> = [...query, ['limit', PAGE_LIMIT]]
    if (offset !== undefined) pageQuery.push(['offset', offset])
    const page = pageSchema.parse(await callApi(api, { method: 'GET', path, query: pageQuery }, signal))
    items.push(...page.data)
    offset = page.next_page?.offset
  } while (offset !== undefined)
  return items
}

function taskPriority (task: AsanaTask): Priority {
  const field = (task.custom_fields ?? []).find((custom) => /priority/i.test(custom.name))
  return priority(field?.display_value ?? '')
}

async function taskComments (api: ApiCall, task: AsanaTask, bundle: TrackerBundle, signal: AbortSignal): Promise<CommentImport[]> {
  const stories = await listAll(api, `/api/1.0/tasks/${task.gid}/stories`, [['opt_fields', STORY_FIELDS]], asanaStory, signal)
  return stories
    .filter((story) => story.resource_subtype === 'comment_added' && (story.text ?? '').trim() !== '')
    .map((story) => ({ author: toPerson(story.created_by), date: bundle.date(story.created_at), text: (story.text ?? '').trim() }))
}

async function toIssue (
  api: ApiCall,
  task: AsanaTask,
  projectGid: string,
  parentKey: string | undefined,
  bundle: TrackerBundle,
  signal: AbortSignal
): Promise<IssueImport> {
  const section = (task.memberships ?? []).find((membership) => membership.project?.gid === projectGid)?.section?.name ?? ''
  return {
    key: task.gid,
    parentKey,
    title: task.name.trim(),
    description: task.html_notes != null && task.html_notes !== '' ? htmlToMarkdown(task.html_notes) : task.notes ?? '',
    status: statusCategory(section, task.completed ? 'done' : undefined),
    sourceStatus: task.completed ? 'Completed' : section,
    priority: taskPriority(task),
    assignee: toPerson(task.assignee),
    creator: toPerson(task.created_by),
    labels: (task.tags ?? []).map((tag) => tag.name),
    dueDate: bundle.date(task.due_at ?? task.due_on ?? ''),
    createdOn: bundle.date(task.created_at ?? ''),
    comments: await taskComments(api, task, bundle, signal)
  }
}

export const asanaConnector: Connector = {
  listScopes: async (api) => {
    const signal = new AbortController().signal
    const scopes: ScopeOption[] = []
    for (const workspace of await listAll(api, '/api/1.0/workspaces', [], named, signal)) {
      const projects = await listAll(api, '/api/1.0/projects', [['workspace', workspace.gid], ['archived', 'false']], named, signal)
      scopes.push(
        ...projects.map((project): ScopeOption => ({
          id: project.gid,
          name: project.name,
          kind: 'project',
          parentName: workspace.name,
          isSelected: true
        }))
      )
    }
    return scopes
  },

  fetch: async (api, scopeIds, onProgress, signal) => {
    const bundle = new TrackerBundle()
    const seen = new Set<string>()
    for (const projectGid of scopeIds) {
      const project = z
        .object({ data: named })
        .parse(await callApi(api, { method: 'GET', path: `/api/1.0/projects/${projectGid}`, query: [['opt_fields', 'name']] }, signal))
        .data
      let count = 0
      const addTasks = async (tasks: AsanaTask[], parentKey: string | undefined): Promise<void> => {
        for (const task of tasks) {
          if (seen.has(task.gid)) {
            bundle.count('Asana tasks in more than one selected project were imported once')
            continue
          }
          seen.add(task.gid)
          bundle.add(project.name, await toIssue(api, task, projectGid, parentKey, bundle, signal))
          onProgress({ label: project.name, count: ++count })
          if ((task.num_subtasks ?? 0) === 0) continue
          const subtasks = await listAll(api, `/api/1.0/tasks/${task.gid}/subtasks`, [['opt_fields', TASK_FIELDS]], asanaTask, signal)
          await addTasks(subtasks, task.gid)
        }
      }
      const tasks = await listAll(api, '/api/1.0/tasks', [['project', projectGid], ['opt_fields', TASK_FIELDS]], asanaTask, signal)
      await addTasks(tasks, undefined)
    }
    return bundle.build()
  }
}
