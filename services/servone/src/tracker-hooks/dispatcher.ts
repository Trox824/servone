import { Dispatcher as OutgoingDispatcher } from '../outgoing/dispatcher'
import type { StoredTrackerHook } from './store'

export { deliveryIdFor, EXPIRE_AFTER_MS, MAX_CONSECUTIVE_FAILURES, nextAttemptAt } from '../outgoing/dispatcher'

export class Dispatcher extends OutgoingDispatcher<StoredTrackerHook> {}
