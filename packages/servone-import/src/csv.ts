export function parseCsv (text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let isQuoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (isQuoted) {
      if (ch !== '"') field += ch
      else if (src[i + 1] === '"') {
        field += '"'
        i++
      } else isQuoted = false
    } else if (ch === '"') isQuoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export class CsvTable {
  readonly headers: string[]
  readonly rows: string[][]
  private readonly columns = new Map<string, number[]>()

  constructor (text: string) {
    const [headers = [], ...rows] = parseCsv(text)
    this.headers = headers.map((header) => header.trim())
    this.rows = rows.filter((row) => row.some((cell) => cell.trim() !== ''))
    this.headers.forEach((header, index) => {
      const key = header.toLowerCase()
      this.columns.set(key, [...(this.columns.get(key) ?? []), index])
    })
  }

  require (...names: string[]): void {
    const missing = names.filter((name) => !this.columns.has(name.toLowerCase()))
    if (missing.length > 0) {
      throw new Error(`Missing column ${missing.map((name) => `"${name}"`).join(', ')}. Check that this is the right export file.`)
    }
  }

  all (row: string[], name: string): string[] {
    return (this.columns.get(name.toLowerCase()) ?? [])
      .map((index) => (row[index] ?? '').trim())
      .filter((cell) => cell !== '')
  }

  first (row: string[], name: string): string {
    return this.all(row, name)[0] ?? ''
  }
}
