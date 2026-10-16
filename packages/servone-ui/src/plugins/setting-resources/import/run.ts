import type {
  ChannelImport,
  DocImport,
  ImportBundle,
  ImportRequest,
  IssueImport,
  PersonRef,
  ProjectImport,
  TeamspaceImport
} from '@servone/import'
import type { Json } from '../../chunter-resources/webhooks/api'

export const MAX_ISSUES_PER_BATCH = 100
export const MAX_MESSAGES_PER_BATCH = 500
export const MAX_DOCS_PER_BATCH = 100
export const MAX_PEOPLE_PER_MATCH = 500
export const MAX_BATCH_BYTES = 4_000_000

export type Post = (request: ImportRequest) => Promise<Json>

export interface ImportCounts {
  projects: number
  issues: number
  channels: number
  messages: number
  teamspaces: number
  docs: number
}

export interface ImportProgress {
  unit: string
  done: number
  total: number
}

export class ImportFailure extends Error {
  constructor (
    readonly unit: string,
    readonly imported: ImportCounts,
    readonly reason: Error
  ) {
    super(`${unit}: ${reason.message}`)
  }
}

export class MalformedReply extends Error {
  constructor (op: ImportRequest['op']) {
    super(`Unexpected server reply to ${op}`)
  }
}

function field (json: Json, key: string): Json | undefined {
  return typeof json === 'object' && json !== null && !Array.isArray(json) ? json[key] : undefined
}

function readId (json: Json, op: ImportRequest['op']): string {
  const id = field(json, 'id')
  if (typeof id !== 'string') throw new MalformedReply(op)
  return id
}

function readIds (json: Json, op: ImportRequest['op']): Map<string, string> {
  const ids = field(json, 'ids')
  if (typeof ids !== 'object' || ids === null || Array.isArray(ids)) throw new MalformedReply(op)
  const created = new Map<string, string>()
  for (const [key, id] of Object.entries(ids)) {
    if (typeof id !== 'string') throw new MalformedReply(op)
    created.set(key, id)
  }
  return created
}

function readMatches (json: Json, count: number): Array<string | null> {
  const matches = field(json, 'matches')
  if (!Array.isArray(matches) || matches.length !== count) throw new MalformedReply('match')
  return matches.map((match) => {
    if (match !== null && typeof match !== 'string') throw new MalformedReply('match')
    return match
  })
}

const encoder = new TextEncoder()

export function batches<T> (items: T[], maxCount: number, maxBytes = MAX_BATCH_BYTES): T[][] {
  const groups: T[][] = []
  let current: T[] = []
  let currentBytes = 0
  for (const entry of items) {
    const bytes = encoder.encode(JSON.stringify(entry)).length
    if (current.length > 0 && (current.length >= maxCount || currentBytes + bytes > maxBytes)) {
      groups.push(current)
      current = []
      currentBytes = 0
    }
    current.push(entry)
    currentBytes += bytes
  }
  if (current.length > 0) groups.push(current)
  return groups
}

function personKey (person: PersonRef): string | undefined {
  const email = person.email?.trim().toLowerCase()
  if (email !== undefined && email !== '') return email
  const name = person.name?.trim().toLowerCase()
  return name !== undefined && name !== '' ? name : undefined
}

export function collectPeople (bundle: ImportBundle): PersonRef[] {
  const people = new Map<string, PersonRef>()
  const add = (person: PersonRef | undefined): void => {
    if (person === undefined) return
    const key = personKey(person)
    if (key !== undefined && !people.has(key)) people.set(key, person)
  }
  for (const project of bundle.projects) {
    for (const issue of project.issues) {
      add(issue.assignee)
      add(issue.creator)
      for (const comment of issue.comments) add(comment.author)
    }
  }
  for (const channel of bundle.channels) {
    channel.members.forEach(add)
    for (const message of channel.messages) add(message.author)
  }
  return [...people.values()]
}

export async function matchPeople (people: PersonRef[], post: Post): Promise<Array<string | null>> {
  const matches: Array<string | null> = []
  for (const group of batches(people, MAX_PEOPLE_PER_MATCH, Infinity)) {
    matches.push(...readMatches(await post({ op: 'match', people: group }), group.length))
  }
  return matches
}

export function docCount (docs: DocImport[]): number {
  return docs.reduce((sum, doc) => sum + 1 + docCount(doc.children), 0)
}

export function unitSize (unit: ProjectImport | ChannelImport | TeamspaceImport): number {
  if ('issues' in unit) return 1 + unit.issues.length
  if ('messages' in unit) return 1 + unit.messages.length
  return 1 + docCount(unit.docs)
}

export function itemCount (bundle: ImportBundle): number {
  return [...bundle.projects, ...bundle.channels, ...bundle.teamspaces].reduce((sum, unit) => sum + unitSize(unit), 0)
}

export function issueLevels (issues: IssueImport[]): IssueImport[][] {
  const keys = new Set(issues.map((issue) => issue.key))
  const levels: IssueImport[][] = []
  let level = issues.filter((issue) => issue.parentKey === undefined || !keys.has(issue.parentKey))
  while (level.length > 0) {
    levels.push(level)
    const parents = new Set(level.map((issue) => issue.key))
    level = issues.filter((issue) => issue.parentKey !== undefined && parents.has(issue.parentKey))
  }
  return levels
}

interface KeyedDoc {
  key: string
  parentKey?: string
  doc: DocImport
}

export function docLevels (docs: DocImport[]): KeyedDoc[][] {
  const levels: KeyedDoc[][] = []
  let level: KeyedDoc[] = docs.map((doc, index) => ({ key: `${index}`, doc }))
  while (level.length > 0) {
    levels.push(level)
    level = level.flatMap(({ key, doc }) =>
      doc.children.map((child, index) => ({ key: `${key}.${index}`, parentKey: key, doc: child }))
    )
  }
  return levels
}

function createdId (ids: Map<string, string>, key: string, op: ImportRequest['op']): string {
  const id = ids.get(key)
  if (id === undefined) throw new MalformedReply(op)
  return id
}

export async function runImport (
  bundle: ImportBundle,
  post: Post,
  onProgress: (progress: ImportProgress) => void
): Promise<ImportCounts> {
  const imported: ImportCounts = { projects: 0, issues: 0, channels: 0, messages: 0, teamspaces: 0, docs: 0 }
  const total = itemCount(bundle)
  let done = 0
  let unit = ''
  const advance = (count: number): void => {
    done += count
    onProgress({ unit, done, total })
  }

  async function importProject (project: ProjectImport): Promise<void> {
    const projectId = readId(await post({ op: 'project', name: project.name }), 'project')
    imported.projects++
    advance(1)
    const ids = new Map<string, string>()
    for (const [depth, level] of issueLevels(project.issues).entries()) {
      const issues = level.map(({ parentKey, ...fields }) => ({
        ...fields,
        parent: depth === 0 || parentKey === undefined ? undefined : createdId(ids, parentKey, 'issues')
      }))
      for (const group of batches(issues, MAX_ISSUES_PER_BATCH)) {
        const created = readIds(await post({ op: 'issues', project: projectId, issues: group }), 'issues')
        for (const issue of group) ids.set(issue.key, createdId(created, issue.key, 'issues'))
        imported.issues += group.length
        advance(group.length)
      }
    }
  }

  async function importChannel ({ messages, ...channel }: ChannelImport): Promise<void> {
    const channelId = readId(await post({ op: 'channel', channel }), 'channel')
    imported.channels++
    advance(1)
    const isRoot = (message: ChannelImport['messages'][number]): boolean =>
      message.threadKey === undefined || message.threadKey === message.key
    const roots = messages.filter(isRoot).map(({ threadKey, ...message }) => message)
    const ids = new Map<string, string>()
    for (const group of batches(roots, MAX_MESSAGES_PER_BATCH)) {
      const created = readIds(await post({ op: 'messages', channel: channelId, messages: group }), 'messages')
      for (const message of group) ids.set(message.key, createdId(created, message.key, 'messages'))
      imported.messages += group.length
      advance(group.length)
    }
    const replies = messages.flatMap(({ threadKey, ...message }) => {
      const thread = threadKey === undefined || threadKey === message.key ? undefined : ids.get(threadKey)
      return thread === undefined ? [] : [{ ...message, thread }]
    })
    for (const group of batches(replies, MAX_MESSAGES_PER_BATCH)) {
      readIds(await post({ op: 'messages', channel: channelId, messages: group }), 'messages')
      imported.messages += group.length
      advance(group.length)
    }
  }

  async function importTeamspace (teamspace: TeamspaceImport): Promise<void> {
    const teamspaceId = readId(await post({ op: 'teamspace', name: teamspace.name }), 'teamspace')
    imported.teamspaces++
    advance(1)
    const ids = new Map<string, string>()
    for (const level of docLevels(teamspace.docs)) {
      const docs = level.map(({ key, parentKey, doc }) => ({
        key,
        title: doc.title,
        markdown: doc.markdown,
        parent: parentKey === undefined ? undefined : createdId(ids, parentKey, 'docs')
      }))
      for (const group of batches(docs, MAX_DOCS_PER_BATCH)) {
        const created = readIds(await post({ op: 'docs', teamspace: teamspaceId, docs: group }), 'docs')
        for (const doc of group) ids.set(doc.key, createdId(created, doc.key, 'docs'))
        imported.docs += group.length
        advance(group.length)
      }
    }
  }

  async function step (name: string, importUnit: () => Promise<void>): Promise<void> {
    unit = name
    onProgress({ unit, done, total })
    try {
      await importUnit()
    } catch (error) {
      throw new ImportFailure(name, imported, error instanceof Error ? error : new Error(String(error)))
    }
  }

  for (const project of bundle.projects) await step(project.name, async () => { await importProject(project) })
  for (const channel of bundle.channels) await step(channel.name, async () => { await importChannel(channel) })
  for (const teamspace of bundle.teamspaces) await step(teamspace.name, async () => { await importTeamspace(teamspace) })
  return imported
}

export interface Newcomer {
  email: string
  name?: string
}

export function newcomers (people: PersonRef[], matches: Array<string | null>): Newcomer[] {
  const seen = new Set<string>()
  return people.flatMap((person, index) => {
    const email = person.email?.trim() ?? ''
    const key = email.toLowerCase()
    if (matches[index] !== null || !email.includes('@') || seen.has(key)) return []
    seen.add(key)
    const name = person.name?.trim()
    return [{ email, name: name === '' ? undefined : name }]
  })
}
