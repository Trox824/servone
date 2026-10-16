export type SourceId =
  | 'linear'
  | 'clickup'
  | 'jira'
  | 'asana'
  | 'trello'
  | 'monday'
  | 'slack'
  | 'teams'
  | 'discord'
  | 'notion'
  | 'confluence'
  | 'gdocs'

export interface PersonRef {
  name?: string
  email?: string
}

export type StatusCategory = 'backlog' | 'todo' | 'inProgress' | 'done' | 'canceled'

export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'

export interface CommentImport {
  author?: PersonRef
  date?: number
  text: string
}

export interface IssueImport {
  key: string
  parentKey?: string
  title: string
  description: string
  status: StatusCategory
  sourceStatus: string
  priority: Priority
  assignee?: PersonRef
  creator?: PersonRef
  labels: string[]
  estimateHours?: number
  dueDate?: number
  createdOn?: number
  comments: CommentImport[]
}

export interface ProjectImport {
  name: string
  issues: IssueImport[]
}

export interface MessageImport {
  key: string
  threadKey?: string
  author?: PersonRef
  date: number
  text: string
}

export interface ChannelImport {
  name: string
  topic: string
  isPrivate: boolean
  isArchived: boolean
  members: PersonRef[]
  messages: MessageImport[]
}

export interface DocImport {
  title: string
  markdown: string
  children: DocImport[]
}

export interface TeamspaceImport {
  name: string
  docs: DocImport[]
}

export interface ImportBundle {
  projects: ProjectImport[]
  channels: ChannelImport[]
  teamspaces: TeamspaceImport[]
  warnings: string[]
}

export interface ExportFile {
  name: string
  bytes: Uint8Array
}

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export interface ApiRequest {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  query?: Array<[string, string]>
  body?: Json
}

export interface ApiResponse {
  status: number
  body: Json
  retryAfterSeconds?: number
}

export type ApiCall = (request: ApiRequest) => Promise<ApiResponse>

export type ScopeKind = 'workspace' | 'team' | 'space' | 'project' | 'board' | 'channel' | 'folder' | 'page'

export interface ScopeOption {
  id: string
  name: string
  kind: ScopeKind
  parentName?: string
  isSelected: boolean
}

export interface FetchProgress {
  label: string
  count: number
}

export interface Connector {
  listScopes: (api: ApiCall) => Promise<ScopeOption[]>
  fetch: (api: ApiCall, scopeIds: string[], onProgress: (progress: FetchProgress) => void, signal: AbortSignal) => Promise<ImportBundle>
}

export interface FileImport {
  accept: '.csv' | '.zip' | '.json'
  parse: (file: ExportFile) => ImportBundle
}

export type SourceArea = 'tracker' | 'chat' | 'documents'

export interface Source {
  id: SourceId
  name: string
  area: SourceArea
  file?: FileImport
  connector?: Connector
}

export type ImportRequest =
  | { op: 'match', people: PersonRef[] }
  | { op: 'project', name: string }
  | { op: 'issues', project: string, issues: Array<Omit<IssueImport, 'parentKey'> & { parent?: string }> }
  | { op: 'channel', channel: Omit<ChannelImport, 'messages'> }
  | { op: 'messages', channel: string, messages: Array<Omit<MessageImport, 'threadKey'> & { thread?: string }> }
  | { op: 'teamspace', name: string }
  | { op: 'docs', teamspace: string, docs: Array<{ key: string, title: string, markdown: string, parent?: string }> }

export interface MatchResponse {
  matches: Array<string | null>
}

export interface CreatedResponse {
  id: string
  identifier?: string
}

export interface BatchResponse {
  ids: Record<string, string>
}
