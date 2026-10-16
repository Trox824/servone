import type { IntlString } from '@hcengineering/platform'
import { str } from '../sprints/plugin'
import type { HookState, TrackerEvent } from './api'

export const EVENT_LABELS: Record<TrackerEvent, IntlString> = {
  'issue.created': str.EventIssueCreated,
  'issue.updated': str.EventIssueUpdated,
  'issue.status_changed': str.EventStatusChanged,
  'issue.assigned': str.EventAssigned,
  'comment.added': str.EventCommentAdded,
  'issue.deleted': str.EventIssueDeleted
}

export const STATE_LABELS: Record<HookState, IntlString> = {
  active: str.WebhookActive,
  offAfterFailures: str.WebhookOffAfterFailures,
  off: str.WebhookOff
}
