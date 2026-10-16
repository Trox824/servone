import { DEFAULT_QUERY, parseInsightsQuery, type InsightsQuery } from './lib/types'

const OPEN_KEY = 'servone.insights.open'
const QUERY_KEY = 'servone.insights.query'

function read (key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (err) {
    if (err instanceof DOMException) return null
    throw err
  }
}

function write (key: string, text: string): void {
  try {
    localStorage.setItem(key, text)
  } catch (err) {
    if (!(err instanceof DOMException)) throw err
  }
}

export function readIsOpen (viewPath: string): boolean {
  return read(`${OPEN_KEY}:${viewPath}`) === 'true'
}

export function writeIsOpen (viewPath: string, isOpen: boolean): void {
  write(`${OPEN_KEY}:${viewPath}`, String(isOpen))
}

export function readQuery (viewPath: string): InsightsQuery {
  return parseInsightsQuery(read(`${QUERY_KEY}:${viewPath}`)) ?? DEFAULT_QUERY
}

export function writeQuery (viewPath: string, query: InsightsQuery): void {
  write(`${QUERY_KEY}:${viewPath}`, JSON.stringify(query))
}
