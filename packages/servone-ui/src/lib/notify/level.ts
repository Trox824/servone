import type { TxOperations } from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'
import type { NotifyLevel } from '@servone/notify-rules'

export { NOTIFY_LEVELS, parseNotifyLevel, type NotifyLevel } from '@servone/notify-rules'

interface LevelledNotifyContext extends DocNotifyContext {
  servoneNotifyLevel?: NotifyLevel
}

export async function setNotifyLevel (client: TxOperations, context: DocNotifyContext, level: NotifyLevel): Promise<void> {
  const levelled: LevelledNotifyContext = context
  await client.update(levelled, { servoneNotifyLevel: level })
}
