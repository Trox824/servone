import type { Account, TxOperations } from '@hcengineering/core'

// Narrow on purpose: presentation getClient() and the servone-mcp REST TxOperations both satisfy it.
export type ConfigClient = Pick<TxOperations, 'findAll' | 'tx'>

export interface ConfigSession {
  client: ConfigClient
  account: Account
}
