// Plugins and Servone packages that dev/tool does not depend on, resolved from services/servone's node_modules,
// plus the system connection (the tracker seed's, with the session's service id as a parameter).
import { createRequire } from 'node:module'
import { join } from 'node:path'
import {
  addLocation,
  core,
  generateId,
  getAccountClient,
  getResource,
  need,
  repoRoot,
  setMetadata,
  systemAccountUuid,
  TxOperations,
  WebSocket
} from '../servone-tracker-seed/workspace'

export const fromService = createRequire(join(repoRoot, 'services', 'servone', 'package.json'))

export const hrLib = fromService('@hcengineering/hr')
export const hr = hrLib.default
export const driveLib = fromService('@hcengineering/drive')
export const drive = driveLib.default
export const request = fromService('@hcengineering/request').default
export const calendarLib = fromService('@hcengineering/calendar')
export const calendar = calendarLib.default
export const taskLib = fromService('@hcengineering/task')
export const trackerLib = fromService('@hcengineering/tracker')
export const attachment = fromService('@hcengineering/attachment').default
export const card = fromService('@hcengineering/card').default

/** The id the approval engine writes under; the transactor's approval guard lets only this session (and the workspace service) past it. */
export const APPROVALS_SERVICE = 'servone-approvals'
export const TOOL_SERVICE = 'tool'

const serverToken = need('@hcengineering/server-token')
const clientLib = need('@hcengineering/client')

export interface Connection {
  client: any
  close: () => Promise<void>
  token: string
  workspaceUuid: string
}

export async function connectAs (args: { workspace: string, accounts: string }, service: string): Promise<Connection> {
  const secret = process.env.SERVER_SECRET
  if (secret === undefined || secret === '') throw new Error('SERVER_SECRET is not set')
  setMetadata(serverToken.default.metadata.Secret, secret)

  const systemToken = serverToken.generateToken(systemAccountUuid, undefined, { service: TOOL_SERVICE })
  const workspaces = await getAccountClient(args.accounts, systemToken).listWorkspaces(null)
  const found = workspaces.find((w: any) => w.url === args.workspace)
  if (found === undefined) throw new Error(`workspace "${args.workspace}" not found`)
  const token = serverToken.generateToken(systemAccountUuid, found.uuid, { service })
  const { endpoint } = await getAccountClient(args.accounts, token).selectWorkspace('', 'external')

  const client = clientLib.default
  // Node 25 ships global Web Storage; the client then takes its browser paths (window, indexedDB).
  for (const name of ['sessionStorage', 'localStorage']) {
    Object.defineProperty(globalThis, name, { value: undefined, configurable: true })
  }
  setMetadata(client.metadata.UseBinaryProtocol, true)
  setMetadata(client.metadata.UseProtocolCompression, true)
  setMetadata(client.metadata.ClientSocketFactory, (url: string) => new WebSocket(url))
  addLocation(clientLib.clientId, async () => await need('@hcengineering/client-resources'))
  const conn = await (await getResource(client.function.GetClient))(token, endpoint)
  return { client: new TxOperations(conn, core.account.System), close: async () => await conn.close(), token, workspaceUuid: found.uuid }
}

export { generateId }
