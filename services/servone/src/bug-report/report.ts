import type { Json } from '../http-json'

export const MAX_TEXT_CHARS = 5000
export const MAX_CONTEXT_CHARS = 500
export const MAX_IMAGES = 3
export const MAX_IMAGE_BYTES = 5_000_000
export const MAX_IMAGE_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4
const SUBJECT_PREFIX = '[Servone bug] '
const SUBJECT_TEXT_CHARS = 60

const CONTEXT_FIELDS = ['path', 'version', 'userAgent', 'viewport', 'language', 'localTime'] as const
const IMAGE_EXTENSIONS = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif']])
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export interface ReportImage {
  filename: string
  content: string
}

export interface BugReport {
  text: string
  path: string
  version: string
  userAgent: string
  viewport: string
  language: string
  localTime: string
  images: ReportImage[]
}

export interface Reporter {
  name: string
  email: string | undefined
  workspaceName: string
  workspaceUuid: string
}

export interface ReportMail {
  to: string[]
  subject: string
  text: string
  replyTo: string | undefined
  attachments: ReportImage[]
}

function parseImages (body: Json | undefined): ReportImage[] | undefined {
  if (body === undefined) return []
  if (!Array.isArray(body) || body.length > MAX_IMAGES) return undefined
  const images: ReportImage[] = []
  for (const [index, entry] of body.entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
    const { contentType, content } = entry
    const extension = typeof contentType === 'string' ? IMAGE_EXTENSIONS.get(contentType) : undefined
    if (extension === undefined || typeof content !== 'string') return undefined
    if (content.length > MAX_IMAGE_BASE64_CHARS || !BASE64.test(content)) return undefined
    images.push({ filename: `screenshot-${index + 1}.${extension}`, content })
  }
  return images
}

export function parseBugReport (body: Json): BugReport | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
  const { text } = body
  if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT_CHARS) return undefined
  const context = { path: '', version: '', userAgent: '', viewport: '', language: '', localTime: '' }
  for (const field of CONTEXT_FIELDS) {
    const entry = body[field]
    if (typeof entry !== 'string' || entry.length > MAX_CONTEXT_CHARS) return undefined
    context[field] = entry
  }
  const images = parseImages(body.images)
  if (images === undefined) return undefined
  return { text: text.trim(), ...context, images }
}

export function buildReportMail (to: string, report: BugReport, reporter: Reporter): ReportMail {
  const subjectText = report.text.replace(/\s+/g, ' ').slice(0, SUBJECT_TEXT_CHARS)
  const text = [
    report.text,
    '',
    '---',
    `Reporter: ${reporter.name} <${reporter.email ?? 'no email on file'}>`,
    `Workspace: ${reporter.workspaceName} (${reporter.workspaceUuid})`,
    `Path: ${report.path}`,
    `Version: ${report.version}`,
    `User agent: ${report.userAgent}`,
    `Viewport: ${report.viewport}`,
    `Language: ${report.language}`,
    `Time: ${report.localTime}`
  ].join('\n')
  return { to: [to], subject: `${SUBJECT_PREFIX}${subjectText}`, text, replyTo: reporter.email, attachments: report.images }
}
