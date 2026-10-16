import notification, { type CommonInboxNotification, type InboxNotification } from '@hcengineering/notification'
import type { IntlString } from '@hcengineering/platform'

export function isNotice (inboxNotification: InboxNotification): inboxNotification is CommonInboxNotification {
  return inboxNotification._class === notification.class.CommonInboxNotification
}

const EXPORT_ARCHIVE = /^export-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}-([\w-]+:string:\w+)-([a-z]+)-(\d+)\.zip$/i

export interface ExportArchive {
  classLabel: IntlString
  format: string
  createdOn: number
}

export function parseExportArchive (fileName: string): ExportArchive | undefined {
  const match = EXPORT_ARCHIVE.exec(fileName)
  if (match === null) return undefined
  return { classLabel: match[1] as IntlString, format: match[2].toUpperCase(), createdOn: Number(match[3]) }
}

export type InboxGroup = 'today' | 'week' | 'earlier'

const WEEK_DAYS = 7

export function inboxGroupOf (date: Date, now: Date): InboxGroup {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (date >= startOfToday) return 'today'
  const weekAgo = new Date(startOfToday)
  weekAgo.setDate(weekAgo.getDate() - (WEEK_DAYS - 1))
  return date >= weekAgo ? 'week' : 'earlier'
}
