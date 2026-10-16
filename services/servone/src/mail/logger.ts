import type { MeasureContext } from '@hcengineering/core'

interface LogEntry {
  msg?: string
  err?: Error
}

export interface MailLogger {
  debug: (entry: LogEntry) => void
  info: (entry: LogEntry) => void
  warn: (entry: LogEntry) => void
  error: (entry: LogEntry) => void
}

// imapflow log entries can carry commands with credentials; only the message and error text leave this function.
export function createMailLogger (ctx: MeasureContext, mailbox: string): MailLogger {
  const fields = (entry: LogEntry): { mailbox: string, error: string } => ({ mailbox, error: entry.err?.message ?? '' })
  return {
    debug: () => {},
    info: () => {},
    warn: (entry) => { ctx.warn(entry.msg ?? 'imap warning', fields(entry)) },
    error: (entry) => { ctx.error(entry.msg ?? 'imap error', fields(entry)) }
  }
}
