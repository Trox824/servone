import type { Ref, WorkspaceUuid } from '@hcengineering/core'
import type { KeyValueClient } from '@hcengineering/kvs-client'
import type { Project } from '@hcengineering/tracker'
import {
  type AttemptRecord as OutgoingAttempt,
  type OutgoingHook,
  OutgoingHookStore,
  type PendingDelivery as OutgoingDelivery
} from '../outgoing/store'
import type { TrackerEvent } from './events'

export const KVS_NAMESPACE = 'servone-tracker-hooks'

export interface StoredTrackerHook extends OutgoingHook<TrackerEvent> {
  project: Ref<Project>
}

export type DeliveryEvent = TrackerEvent | 'test'
export type PendingDelivery = OutgoingDelivery<TrackerEvent>
export type AttemptRecord = OutgoingAttempt<TrackerEvent>

export class TrackerHookStore extends OutgoingHookStore<StoredTrackerHook> {
  constructor (kv: KeyValueClient) {
    super(kv, { prefix: 'proj', ownerOf: (hook) => hook.project })
  }

  async listProjectHooks (workspace: WorkspaceUuid, project: Ref<Project>): Promise<StoredTrackerHook[]> {
    return await this.listOwnerHooks(workspace, project)
  }
}
