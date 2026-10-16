// ponytail: per-process fixed windows; limits reset on deploy and multiply by replica count. Move to redis if account scales out.
export class RateLimiter {
  private readonly windows = new Map<string, { count: number, resetAt: number }>()

  constructor (
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  isAllowed (key: string, now = Date.now()): boolean {
    const window = this.windows.get(key)
    if (window === undefined || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    window.count++
    return window.count <= this.limit
  }

  sweep (now = Date.now()): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
  }
}

export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
// Sized for an office behind one NAT onboarding together.
const AUTH_LIMIT_PER_IP = 60
// 10 OTP guesses per window keeps a 6-digit code out of brute-force reach.
const AUTH_LIMIT_PER_IP_EMAIL = 10
const AUTH_LIMIT_PER_EMAIL = 50

export class AuthRateLimiter {
  private readonly perIp = new RateLimiter(AUTH_LIMIT_PER_IP, AUTH_RATE_LIMIT_WINDOW_MS)
  private readonly perIpEmail = new RateLimiter(AUTH_LIMIT_PER_IP_EMAIL, AUTH_RATE_LIMIT_WINDOW_MS)
  private readonly perEmail = new RateLimiter(AUTH_LIMIT_PER_EMAIL, AUTH_RATE_LIMIT_WINDOW_MS)

  isAllowed (ip: string, email: string | undefined, now = Date.now()): boolean {
    if (!this.perIp.isAllowed(ip, now)) return false
    if (email === undefined) return true
    return this.perIpEmail.isAllowed(`${ip} ${email}`, now) && this.perEmail.isAllowed(email, now)
  }

  sweep (now = Date.now()): void {
    this.perIp.sweep(now)
    this.perIpEmail.sweep(now)
    this.perEmail.sweep(now)
  }
}

// Railway's edge appends the client IP, so the last X-Forwarded-For entry is the one a client cannot forge.
export function getClientIp (forwardedFor: string | string[] | undefined, socketIp: string): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor
  const last = header?.split(',').pop()?.trim()
  return last !== undefined && last !== '' ? last : socketIp
}
