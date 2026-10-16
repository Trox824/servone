import core, { type Doc, type DocumentClassQuery, TxFactory, type TxApplyResult, type TxCUD, type TxResult } from '@hcengineering/core'
import type { ConfigSession } from './client'
import { ConfigError } from './errors'
import { APPLY_SCOPE } from './ids'

function isRejected (outcome: TxResult): boolean {
  const applied: Partial<TxApplyResult> = outcome
  return applied.success === false
}

// match turns this into a check-then-write: a guard that no longer holds fails the whole apply and nothing is written.
export async function applyIf (session: ConfigSession, txes: Array<TxCUD<Doc>>, match: DocumentClassQuery<Doc>[]): Promise<boolean> {
  const factory = new TxFactory(session.account.primarySocialId)
  const outcome = await session.client.tx(factory.createTxApplyIf(core.space.Tx, APPLY_SCOPE, match, [], txes, undefined))
  return !isRejected(outcome)
}

export async function sendTxes (
  session: ConfigSession,
  txes: Array<TxCUD<Doc>>,
  match: DocumentClassQuery<Doc>[] = []
): Promise<void> {
  if (txes.length === 0) return
  if (await applyIf(session, txes, match)) return
  if (match.length > 0) throw new ConfigError('wrong-status', 'Thay đổi đã bị cập nhật ở nơi khác; hãy tải lại')
  throw new ConfigError('failed', 'Máy chủ không áp dụng được thay đổi; chưa có gì được ghi')
}
