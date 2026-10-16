import { createRestClient, type RestClient } from '@hcengineering/api-client'
import contact, { type Person } from '@hcengineering/contact'
import {
  isActiveMode,
  type Ref,
  SocialIdType,
  systemAccountUuid,
  type WorkspaceInfoWithStatus,
  type WorkspaceUuid
} from '@hcengineering/core'
import { getAccountClient, getTransactorEndpoint } from '@hcengineering/server-client'
import { generateToken } from '@hcengineering/server-token'

const WORKSPACE_LIST_TTL_MS = 10 * 60_000

let listedAt = 0
let listed: WorkspaceInfoWithStatus[] = []
// Keyed by service and workspace: each module's token carries its own service id.
const clients = new Map<string, RestClient>()

export async function listActiveWorkspaces (serviceId: string, now: number): Promise<WorkspaceInfoWithStatus[]> {
  if (now - listedAt < WORKSPACE_LIST_TTL_MS) return listed
  // The account service lets only admin or tool/backup tokens list every workspace.
  const token = generateToken(systemAccountUuid, undefined, { service: serviceId, admin: 'true' })
  const workspaces = await getAccountClient(token).listWorkspaces()
  listed = workspaces.filter((workspace) => isActiveMode(workspace.mode) && workspace.isDisabled !== true)
  listedAt = now
  return listed
}

export async function findWorkspace (serviceId: string, uuid: WorkspaceUuid): Promise<WorkspaceInfoWithStatus | undefined> {
  const workspaces = await listActiveWorkspaces(serviceId, Date.now())
  return workspaces.find((workspace) => workspace.uuid === uuid)
}

export async function getWorkspaceClient (serviceId: string, workspace: WorkspaceUuid): Promise<RestClient> {
  const key = `${serviceId}/${workspace}`
  const cached = clients.get(key)
  if (cached !== undefined) return cached
  const token = generateToken(systemAccountUuid, workspace, { service: serviceId })
  const endpoint = await getTransactorEndpoint(token)
  const client = createRestClient(endpoint, workspace, token)
  clients.set(key, client)
  return client
}

export async function findRecipient (client: Pick<RestClient, 'findAll'>, person: Ref<Person>): Promise<string | undefined> {
  // Same identities stock email notifications use (server-plugins/gmail-resources).
  const emails = await client.findAll(
    contact.class.SocialIdentity,
    {
      attachedTo: person,
      type: { $in: [SocialIdType.EMAIL, SocialIdType.GOOGLE] },
      verifiedOn: { $gt: 0 },
      isDeleted: { $ne: true }
    },
    { limit: 1 }
  )
  return emails[0]?.value
}
