import type { IncomingMessage } from 'http'

// Resolves undefined once the body passes the cap; the rest is never read and the socket closes after the reply.
export async function readBody (req: IncomingMessage, maxBytes: number): Promise<string | undefined> {
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) return undefined
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const onData = (chunk: Buffer): void => {
      size += chunk.length
      if (size > maxBytes) {
        req.off('data', onData)
        req.pause()
        resolve(undefined)
        return
      }
      chunks.push(chunk)
    }
    req.on('data', onData)
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}
