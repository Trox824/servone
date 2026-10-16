import type { RestClient } from '@hcengineering/api-client'
import type { Person } from '@hcengineering/contact'
import type {
  Account,
  AccountUuid,
  CollaborativeDoc,
  MarkupBlobRef,
  Ref,
  TxOperations,
  WorkspaceUuid
} from '@hcengineering/core'

export interface Caller {
  token: string
  apiTokenId: string
  account: AccountUuid
  workspace: WorkspaceUuid
  expiresAt: number
}

export interface CollabText {
  readMarkdown: (doc: CollaborativeDoc, source: MarkupBlobRef | null) => Promise<string>
  writeMarkdown: (doc: CollaborativeDoc, markdown: string) => Promise<MarkupBlobRef>
  updateMarkdown: (doc: CollaborativeDoc, markdown: string) => Promise<void>
}

// Only the operations tools use, so tests can fake a session with plain jest.fn() members.
export type SessionClient = Pick<
  TxOperations,
  'findAll' | 'findOne' | 'addCollection' | 'removeCollection' | 'updateDoc' | 'update' | 'getHierarchy' | 'tx'
>

export interface WorkspaceSession {
  workspace: WorkspaceUuid
  account: Account
  person: Ref<Person>
  client: SessionClient
  rest: Pick<RestClient, 'searchFulltext' | 'findAll'>
  collab: CollabText
}
