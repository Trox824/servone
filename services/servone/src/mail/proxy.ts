import type { MeasureContext } from '@hcengineering/core'
import { request } from 'http'
import type { RequestHandler } from '../router'

// Keeps /mail/* on the public servone-mcp origin, so the front's mail URL and Google's registered OAuth redirect
// stay the same while the mail module runs as its own service on the private network.
export function createMailProxy (ctx: MeasureContext, serviceUrl: string): RequestHandler {
  const target = new URL(serviceUrl)
  return async (req, res) => {
    await new Promise<void>((resolve) => {
      const upstream = request(
        {
          hostname: target.hostname,
          port: target.port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: target.host }
        },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
          upstreamRes.pipe(res)
          upstreamRes.on('end', resolve)
          upstreamRes.on('error', () => { res.destroy(); resolve() })
        }
      )
      upstream.on('error', (error) => {
        ctx.warn('mail service unreachable', { error: error.message })
        if (res.headersSent) res.destroy()
        else res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'mail_unavailable' }))
        resolve()
      })
      req.pipe(upstream)
    })
  }
}
