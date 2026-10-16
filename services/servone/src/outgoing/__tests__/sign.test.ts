import { createHmac, timingSafeEqual } from 'crypto'
import { signatureHeaders } from '../sign'

const SECRET = 'Zm9vYmFyYmF6cXV4c2VjcmV0MDEyMzQ1Njc4OWFiY2Q'
const BODY = '{"version":1,"event":"test"}'
const NOW_MS = 1790500443_512

// The receiver check shown in the signing secret dialog, run as written.
function isValid (secret: string, headers: Record<string, string>, rawBody: string, nowMs: number): boolean {
  const ts = Number(headers['servone-timestamp'])
  if (Math.abs(nowMs / 1000 - ts) > 300) return false
  const expected = 'v1=' + createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')
  const given = String(headers['servone-signature'])
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

function lowercased (headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([name, text]) => [name.toLowerCase(), text]))
}

describe('signatureHeaders', () => {
  it('matches a vector computed with openssl', () => {
    expect(signatureHeaders(SECRET, BODY, NOW_MS)).toEqual({
      'Servone-Timestamp': '1790500443',
      'Servone-Signature': 'v1=b1266ff832016ef0824645b39ff89828cdaaabb8f9dd317c5236fa3505dd2019'
    })
  })

  it('passes the documented receiver check', () => {
    expect(isValid(SECRET, lowercased(signatureHeaders(SECRET, BODY, NOW_MS)), BODY, NOW_MS)).toBe(true)
  })

  it('fails the receiver check 301 seconds later', () => {
    expect(isValid(SECRET, lowercased(signatureHeaders(SECRET, BODY, NOW_MS)), BODY, NOW_MS + 301_000)).toBe(false)
  })

  it('fails the receiver check for a changed body', () => {
    expect(isValid(SECRET, lowercased(signatureHeaders(SECRET, BODY, NOW_MS)), `${BODY} `, NOW_MS)).toBe(false)
  })
})
