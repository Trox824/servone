export type Json = string | number | boolean | null | Json[] | JsonObject

export interface JsonObject {
  [key: string]: Json
}

export function isJsonObject (raw: Json): raw is JsonObject {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

export type ParsedJsonText = { kind: 'json', json: Json } | { kind: 'invalid', message: string }

export function parseJsonText (text: string): ParsedJsonText {
  try {
    return { kind: 'json', json: JSON.parse(text) }
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: 'invalid', message: `JSON không hợp lệ: ${error.message}` }
    throw error
  }
}

export class JsonReader {
  constructor (
    private readonly source: JsonObject,
    readonly problems: string[] = [],
    private readonly path: string = ''
  ) {}

  has (key: string): boolean {
    return this.source[key] !== undefined && this.source[key] !== null
  }

  isNull (key: string): boolean {
    return this.source[key] === null
  }

  problem (key: string, expected: string): void {
    this.problems.push(`${this.path}${key}: cần ${expected}`)
  }

  string (key: string): string {
    const raw = this.source[key]
    if (typeof raw === 'string') return raw
    this.problem(key, 'chuỗi')
    return ''
  }

  optionalString (key: string): string | undefined {
    return this.has(key) ? this.string(key) : undefined
  }

  number (key: string): number {
    const raw = this.source[key]
    if (typeof raw === 'number') return raw
    this.problem(key, 'số')
    return 0
  }

  optionalNumber (key: string): number | undefined {
    return this.has(key) ? this.number(key) : undefined
  }

  boolean (key: string): boolean {
    const raw = this.source[key]
    if (typeof raw === 'boolean') return raw
    this.problem(key, 'true hoặc false')
    return false
  }

  optionalBoolean (key: string): boolean | undefined {
    return this.has(key) ? this.boolean(key) : undefined
  }

  scalar (key: string): string | number | boolean | null {
    const raw = this.source[key]
    if (raw === null || typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw
    this.problem(key, 'chuỗi, số, true/false hoặc null')
    return null
  }

  stringArray (key: string): string[] {
    const raw = this.source[key]
    if (Array.isArray(raw)) {
      const strings = raw.filter((it): it is string => typeof it === 'string')
      if (strings.length === raw.length) return strings
    }
    this.problem(key, 'danh sách chuỗi')
    return []
  }

  optionalStringArray (key: string): string[] | undefined {
    return this.has(key) ? this.stringArray(key) : undefined
  }

  object (key: string): JsonReader {
    const raw = this.source[key]
    if (raw !== undefined && isJsonObject(raw)) return new JsonReader(raw, this.problems, `${this.path}${key}.`)
    this.problem(key, 'đối tượng')
    return new JsonReader({}, this.problems, `${this.path}${key}.`)
  }

  objects (key: string): JsonReader[] {
    const raw = this.source[key]
    if (!Array.isArray(raw)) {
      this.problem(key, 'danh sách đối tượng')
      return []
    }
    return raw.map((entry, index) => {
      const path = `${this.path}${key}[${index}].`
      if (isJsonObject(entry)) return new JsonReader(entry, this.problems, path)
      this.problem(`${key}[${index}]`, 'đối tượng')
      return new JsonReader({}, this.problems, path)
    })
  }
}
