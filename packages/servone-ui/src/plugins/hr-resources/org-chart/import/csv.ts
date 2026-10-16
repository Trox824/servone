import { fold } from '../../../../lib/fold'
import type { Translate } from './strings'

export interface StaffRow {
  line: number
  name: string
  email: string
  title: string
  department: string
  managerEmail: string
}

export type ParseProblem = 'MissingEmail' | 'BadEmail' | 'BadManagerEmail'

export interface RowError<Problem extends string = ParseProblem> {
  row: StaffRow
  problem: Problem
}

export type ParsedStaffCsv =
  | { rows: StaffRow[], errors: Array<RowError<ParseProblem>> }
  | { fileError: 'Empty' | 'NoEmailColumn' }

type Column = 'name' | 'email' | 'title' | 'department' | 'managerEmail'

const HEADERS: Record<Column, string[]> = {
  name: ['ho ten', 'ho va ten', 'ten', 'name', 'full name'],
  email: ['email', 'e-mail', 'mail', 'thu dien tu'],
  title: ['chuc danh', 'chuc vu', 'vi tri', 'job title', 'title', 'position'],
  department: ['phong ban', 'bo phan', 'phong', 'department', 'team'],
  managerEmail: ['email quan ly', 'quan ly', 'nguoi quan ly', 'cap tren', 'manager email', 'manager']
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface RawRecord {
  line: number
  fields: string[]
}

function detectSeparator (text: string): { separator: string, body: string } {
  const hint = /^sep=(.)\r?\n/.exec(text)
  if (hint !== null) return { separator: hint[1], body: text.slice(hint[0].length) }
  const header = text.split(/\r?\n/, 1)[0]
  const count = (char: string): number => header.split(char).length - 1
  const separator = [',', ';', '\t'].reduce((best, char) => (count(char) > count(best) ? char : best))
  return { separator, body: text }
}

function records (text: string, separator: string, firstLine: number): RawRecord[] {
  const found: RawRecord[] = []
  let fields: string[] = []
  let field = ''
  let isQuoted = false
  let line = firstLine
  let start = firstLine
  const endRecord = (): void => {
    fields.push(field)
    if (fields.some((value) => value.trim() !== '')) found.push({ line: start, fields })
    fields = []
    field = ''
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (isQuoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        isQuoted = false
      } else {
        if (char === '\n') line++
        field += char
      }
    } else if (char === '"' && field.trim() === '') {
      field = ''
      isQuoted = true
    } else if (char === separator) {
      fields.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      endRecord()
      line++
      start = line
    } else {
      field += char
    }
  }
  if (field !== '' || fields.length > 0) endRecord()
  return found
}

export function parseStaffCsv (text: string): ParsedStaffCsv {
  const withoutBom = text.replace(/^﻿/, '')
  const { separator, body } = detectSeparator(withoutBom)
  const firstLine = body === withoutBom ? 1 : 2
  const [header, ...dataRecords] = records(body, separator, firstLine)
  if (header === undefined) return { fileError: 'Empty' }
  const headers = header.fields.map((field) => fold(field.trim()).replace(/[_\s]+/g, ' '))
  const indexOf = (column: Column): number => headers.findIndex((name) => HEADERS[column].includes(name))
  const columns = {
    name: indexOf('name'),
    email: indexOf('email'),
    title: indexOf('title'),
    department: indexOf('department'),
    managerEmail: indexOf('managerEmail')
  }
  if (columns.email === -1) return { fileError: 'NoEmailColumn' }

  const rows: StaffRow[] = []
  const errors: Array<RowError<ParseProblem>> = []
  for (const { line, fields } of dataRecords) {
    const cell = (index: number): string => (index === -1 ? '' : (fields[index] ?? '').trim().normalize('NFC'))
    const row: StaffRow = {
      line,
      name: cell(columns.name).replace(/\s+/g, ' '),
      email: cell(columns.email).toLowerCase(),
      title: cell(columns.title),
      department: cell(columns.department).replace(/\s+/g, ' '),
      managerEmail: cell(columns.managerEmail).toLowerCase()
    }
    if (row.email === '') errors.push({ row, problem: 'MissingEmail' })
    else if (!EMAIL.test(row.email)) errors.push({ row, problem: 'BadEmail' })
    else if (row.managerEmail !== '' && !EMAIL.test(row.managerEmail)) errors.push({ row, problem: 'BadManagerEmail' })
    else rows.push(row)
  }
  return { rows, errors }
}

export const csvCell = (cell: string): string => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)

export const toCsv = (lines: string[][]): string => '\uFEFF' + lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n'

export function skippedRowsCsv (entries: Array<{ row: StaffRow, reason: string }>, t: Translate): string {
  return toCsv([
    [t('Name'), t('Email'), t('JobTitle'), t('Department'), t('ManagerEmail'), t('Reason')],
    ...entries.map(({ row, reason }) => [row.name, row.email, row.title, row.department, row.managerEmail, reason])
  ])
}
