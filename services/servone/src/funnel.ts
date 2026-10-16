import type { MeasureContext, WorkspaceUuid } from '@hcengineering/core'
import config from './config'

export const funnelEvent = {
  WorkspaceCreated: 'workspace_created',
  InviteAccepted: 'invite_accepted',
  ImportStarted: 'import_started',
  ImportCompleted: 'import_completed',
  ChecklistItemDone: 'checklist_item_done',
  SampleArchived: 'sample_archived'
} as const
export type FunnelEvent = typeof funnelEvent[keyof typeof funnelEvent]

export interface FunnelCapture {
  event: FunnelEvent
  workspace: WorkspaceUuid
  account?: string
  properties?: Record<string, string>
}

const CAPTURE_TIMEOUT_MS = 5000

export function captureBody (capture: FunnelCapture, key: string): string {
  const isPerson = capture.account !== undefined
  return JSON.stringify({
    api_key: key,
    event: capture.event,
    distinct_id: capture.account ?? `workspace:${capture.workspace}`,
    properties: {
      ...capture.properties,
      $groups: { company: capture.workspace },
      $process_person_profile: isPerson
    }
  })
}

export function trackFunnel (ctx: MeasureContext, capture: FunnelCapture): void {
  fetch(`${config.posthog.Host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: captureBody(capture, config.posthog.Key),
    signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS)
  })
    .then((response) => {
      if (!response.ok) ctx.warn('funnel event rejected', { event: capture.event, status: response.status })
    })
    .catch((error: Error) => { ctx.warn('funnel event not sent', { event: capture.event, error: error.message }) })
}
