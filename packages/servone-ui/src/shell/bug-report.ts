import { Analytics } from '@hcengineering/analytics'
import { getMetadata } from '@hcengineering/platform'
import presentation from '@hcengineering/presentation'
import { servoneServiceUrl } from '../plugins/chunter-resources/webhooks/api'

export const MAX_BUG_REPORT_CHARS = 5000
export const MAX_BUG_REPORT_IMAGES = 3
export const MAX_BUG_REPORT_IMAGE_BYTES = 5_000_000
export const BUG_REPORT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_CONTEXT_CHARS = 500
const CALLOUT_KEY_PREFIX = 'servone:bug-report:callout-dismissed:'

export type BugReportFailure = 'rate_limited' | 'network' | 'server'

export class BugReportError extends Error {
  constructor (readonly failure: BugReportFailure) {
    super(`bug report ${failure}`)
  }
}

export function reportContext (language: string): Record<string, string> {
  const fields = {
    path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    version: getMetadata(presentation.metadata.FrontVersion) ?? '',
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language,
    localTime: new Date().toString()
  }
  return Object.fromEntries(Object.entries(fields).map(([name, text]) => [name, text.slice(0, MAX_CONTEXT_CHARS)]))
}

async function readBase64 (file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('expected a data URL'))
    }
    reader.onerror = () => { reject(reader.error) }
    reader.readAsDataURL(file)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

export async function sendBugReport (text: string, language: string, images: File[]): Promise<void> {
  const encodedImages = await Promise.all(images.map(async (image) => ({ contentType: image.type, content: await readBase64(image) })))
  let response: Response
  try {
    const base = await servoneServiceUrl('SERVONE_MCP_URL')
    if (base === undefined) throw new BugReportError('server')
    response = await fetch(`${base}/v1/bug-report`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getMetadata(presentation.metadata.Token) ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...reportContext(language), images: encodedImages })
    })
  } catch (error) {
    if (error instanceof TypeError) throw new BugReportError('network')
    throw error
  }
  if (response.status === 429) throw new BugReportError('rate_limited')
  if (!response.ok) throw new BugReportError('server')
  Analytics.handleEvent('bug_report_sent', { images: images.length })
}

export function isBugCalloutDismissed (account: string): boolean {
  try {
    return localStorage.getItem(`${CALLOUT_KEY_PREFIX}${account}`) !== null
  } catch {
    return false
  }
}

export function dismissBugCallout (account: string): void {
  try {
    localStorage.setItem(`${CALLOUT_KEY_PREFIX}${account}`, '1')
  } catch {
    return
  }
}
