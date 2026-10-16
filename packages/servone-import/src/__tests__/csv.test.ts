import { CsvTable, parseCsv } from '../csv'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF, embedded newlines and BOM', () => {
    const text = '\uFEFFa,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n1,,3\n'
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line1\nline2'],
      ['1', '', '3']
    ])
  })

  it('keeps a last row without a trailing newline and a trailing empty field', () => {
    expect(parseCsv('a,b\n1,')).toEqual([
      ['a', 'b'],
      ['1', '']
    ])
  })
})

describe('CsvTable', () => {
  const table = new CsvTable('Summary,Labels,Labels,Comment\nFix login,bug,,"01/Jan/24 9:00 AM;bob;hi"\n\n')

  it('reads repeated headers and skips blank rows', () => {
    expect(table.rows).toHaveLength(1)
    const [row] = table.rows
    expect(table.all(row, 'Labels')).toEqual(['bug'])
    expect(table.first(row, 'summary')).toBe('Fix login')
    expect(table.first(row, 'Missing')).toBe('')
  })

  it('rejects files without required columns', () => {
    expect(() => {
      table.require('Summary', 'Issue id')
    }).toThrow('"Issue id"')
  })
})
