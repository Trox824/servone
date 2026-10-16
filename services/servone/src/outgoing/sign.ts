import { createHmac } from 'crypto'

// Signed per attempt, not per delivery, so a retry hours later still passes the receiver's 5-minute window.
// `v1=` leaves room for a second scheme without breaking receivers that check the first.
export function signatureHeaders (secret: string, body: string, nowMs: number): Record<'Servone-Timestamp' | 'Servone-Signature', string> {
  const timestamp = String(Math.floor(nowMs / 1000))
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return { 'Servone-Timestamp': timestamp, 'Servone-Signature': `v1=${digest}` }
}
