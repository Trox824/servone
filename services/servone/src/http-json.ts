import type { IncomingMessage, ServerResponse } from 'http'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export interface JsonReply {
  status: number
  body: Json
  headers?: Record<string, string>
}

export const jsonReply = (status: number, body: Json, headers?: Record<string, string>): JsonReply =>
  headers === undefined ? { status, body } : { status, body, headers }

// Undefined when a segment is not valid percent-encoding.
export function pathSegments (url: string | undefined): string[] | undefined {
  const parts = new URL(url ?? '/', 'http://localhost').pathname.split('/').filter((part) => part !== '')
  try {
    return parts.map(decodeURIComponent)
  } catch (error) {
    if (error instanceof URIError) return undefined
    throw error
  }
}

export function corsHeaders (req: IncomingMessage, frontUrl: string): Record<string, string> {
  if (req.headers.origin !== frontUrl) return { Vary: 'Origin' }
  return { 'Access-Control-Allow-Origin': frontUrl, Vary: 'Origin' }
}

export function sendJson (res: ServerResponse, reply: JsonReply, extraHeaders: Record<string, string>): void {
  res.writeHead(reply.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
    ...reply.headers
  })
  res.end(JSON.stringify(reply.body))
}

export interface TextReply {
  status: number
  body: string
  headers?: Record<string, string>
}

export function sendText (res: ServerResponse, reply: TextReply): void {
  res.writeHead(reply.status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...reply.headers
  })
  res.end(reply.body)
}
