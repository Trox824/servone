import type { IncomingMessage } from 'http'

// Railway's edge appends the client IP, so the last X-Forwarded-For entry is the one a client cannot forge.
export function getClientIp (forwardedFor: string | string[] | undefined, socketIp: string): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor
  const last = header?.split(',').pop()?.trim()
  return last !== undefined && last !== '' ? last : socketIp
}

export const clientIpOf = (req: IncomingMessage): string =>
  getClientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress ?? '')
