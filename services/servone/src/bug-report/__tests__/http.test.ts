import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import { AccountRole } from '@hcengineering/core'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

import { TokenBuckets } from '../../webhooks/rate'
import { createBugReportHandler } from '../http'
import { MAX_CONTEXT_CHARS, MAX_IMAGES, MAX_IMAGE_BASE64_CHARS, MAX_TEXT_CHARS, type ReportMail, type Reporter } from '../report'

const CALLER = { account: 'acc-1' as AccountUuid, workspace: 'ws-1' as WorkspaceUuid, role: AccountRole.User }
const REPORTER: Reporter = { name: 'An Nguyen', email: 'an@servone.vn', workspaceName: 'Acme', workspaceUuid: 'ws-1' }
const BODY = {
  text: 'The send button does nothing',
  path: '/workbench/acme/chunter',
  version: '0.7.1',
  userAgent: 'jest',
  viewport: '1440x900',
  language: 'en',
  localTime: '2026-10-10T10:00:00+07:00 Asia/Ho_Chi_Minh'
}
const PNG = { contentType: 'image/png', content: 'iVBORw0KGgo=' }

let server: Server
let base: string
let sent: ReportMail[]
let isMailUp: boolean
let clock: number

beforeEach(async () => {
  sent = []
  isMailUp = true
  clock = 0
  const handler = createBugReportHandler({
    frontUrl: 'https://app.test',
    to: 'team@servone.vn',
    buckets: new TokenBuckets(5, 5 / 3600),
    now: () => clock,
    authenticate: async (authorization) => (authorization === 'Bearer good' ? CALLER : undefined),
    reporterOf: async () => REPORTER,
    sendMail: async (mail) => {
      sent.push(mail)
      return isMailUp
    }
  })
  server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => { resolve() }))
})

async function post (body: object | string, authorization: string | null = 'Bearer good'): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authorization !== null) headers.Authorization = authorization
  return await fetch(`${base}/v1/bug-report`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

describe('bug report endpoint', () => {
  it('answers 401 without a token and sends nothing', async () => {
    expect((await post(BODY, null)).status).toBe(401)
    expect((await post(BODY, 'Bearer bad')).status).toBe(401)
    expect(sent).toHaveLength(0)
  })

  it.each([
    ['empty text', { ...BODY, text: '   ' }],
    ['text too long', { ...BODY, text: 'x'.repeat(MAX_TEXT_CHARS + 1) }],
    ['text missing', { ...BODY, text: undefined }],
    ['context too long', { ...BODY, userAgent: 'x'.repeat(MAX_CONTEXT_CHARS + 1) }],
    ['context not a string', { ...BODY, viewport: 1440 }],
    ['images not an array', { ...BODY, images: PNG }],
    ['too many images', { ...BODY, images: Array(MAX_IMAGES + 1).fill(PNG) }],
    ['image type not allowed', { ...BODY, images: [{ ...PNG, contentType: 'image/svg+xml' }] }],
    ['image type from the prototype', { ...BODY, images: [{ ...PNG, contentType: 'constructor' }] }],
    ['image not base64', { ...BODY, images: [{ ...PNG, content: 'not base64!' }] }],
    ['image too large', { ...BODY, images: [{ ...PNG, content: 'A'.repeat(MAX_IMAGE_BASE64_CHARS + 4) }] }],
    ['not an object', '[1]'],
    ['not json', 'nope']
  ])('answers 400 for %s', async (_name, body) => {
    expect((await post(body)).status).toBe(400)
    expect(sent).toHaveLength(0)
  })

  it('accepts the maximum lengths', async () => {
    const response = await post({ ...BODY, text: 'x'.repeat(MAX_TEXT_CHARS), path: 'p'.repeat(MAX_CONTEXT_CHARS) })
    expect(response.status).toBe(200)
  })

  it('drops unknown fields and takes identity from the account, not the body', async () => {
    const response = await post({ ...BODY, name: 'Mallory', email: 'mallory@evil.test', to: ['victim@x.test'], headers: { Bcc: 'x' } })
    expect(response.status).toBe(200)
    expect(sent).toHaveLength(1)
    const [mail] = sent
    expect(mail.to).toEqual(['team@servone.vn'])
    expect(mail.replyTo).toBe('an@servone.vn')
    expect(mail.subject).toBe('[Servone bug] The send button does nothing')
    expect(mail.text.startsWith(BODY.text)).toBe(true)
    expect(mail.text).toContain('Reporter: An Nguyen <an@servone.vn>')
    expect(mail.text).toContain('Workspace: Acme (ws-1)')
    expect(mail.text).toContain('Path: /workbench/acme/chunter')
    expect(mail.text).not.toContain('Mallory')
    expect(mail.text).not.toContain('evil.test')
  })

  it('attaches images with server-chosen filenames', async () => {
    const response = await post({ ...BODY, images: [PNG, { contentType: 'image/jpeg', content: 'AAAA', filename: '../evil.exe' }] })
    expect(response.status).toBe(200)
    expect(sent[0].attachments).toEqual([
      { filename: 'screenshot-1.png', content: PNG.content },
      { filename: 'screenshot-2.jpg', content: 'AAAA' }
    ])
  })

  it('cuts the subject at 60 characters of the text', async () => {
    await post({ ...BODY, text: `${'a'.repeat(100)}\nsecond line` })
    expect(sent[0].subject).toBe(`[Servone bug] ${'a'.repeat(60)}`)
  })

  it('answers 429 on the sixth report within an hour and recovers later', async () => {
    for (let count = 0; count < 5; count++) expect((await post(BODY)).status).toBe(200)
    const limited = await post(BODY)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).not.toBeNull()
    expect(sent).toHaveLength(5)
    clock = 3600_000
    expect((await post(BODY)).status).toBe(200)
  })

  it('answers 502 when the mail service fails', async () => {
    isMailUp = false
    const response = await post(BODY)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'mail_failed' })
  })
})
