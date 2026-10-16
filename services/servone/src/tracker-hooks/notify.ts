import { disabledEmail as hookDisabledEmail, type DisabledEmail } from '../outgoing/notify'
import type { AttemptRecord, StoredTrackerHook } from './store'

export function disabledEmail (
  hook: StoredTrackerHook,
  last: AttemptRecord,
  projectIdentifier: string,
  hooksPageUrl: string
): DisabledEmail {
  return hookDisabledEmail(
    hook,
    last,
    projectIdentifier,
    `Open the project's webhooks to see the log and turn it back on: ${hooksPageUrl}`
  )
}
