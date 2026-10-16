import { parseStaffCsv, skippedRowsCsv } from '../import/csv'
import { textOf } from '../import/strings'

describe('parseStaffCsv', () => {
  it('reads a comma-separated file with English headers', () => {
    const parsed = parseStaffCsv('name,email,job title,department,manager email\nAn,an@x.vn,CEO,Board,\n')
    expect(parsed).toEqual({
      rows: [{ line: 2, name: 'An', email: 'an@x.vn', title: 'CEO', department: 'Board', managerEmail: '' }],
      errors: []
    })
  })
})

describe('parseStaffCsv with Excel exports', () => {
  it('reads a semicolon file with a BOM, CRLF and Vietnamese headers', () => {
    const text = '﻿Họ tên;Email;Chức danh;Phòng ban;Email quản lý\r\nTrần Thị Bình;Binh@X.vn;Trưởng phòng;Kinh doanh;an@x.vn\r\n'
    expect(parseStaffCsv(text)).toEqual({
      rows: [{ line: 2, name: 'Trần Thị Bình', email: 'binh@x.vn', title: 'Trưởng phòng', department: 'Kinh doanh', managerEmail: 'an@x.vn' }],
      errors: []
    })
  })

  it('honours a sep= line and tab separators', () => {
    const parsed = parseStaffCsv('sep=\t\nemail\tname\nan@x.vn\tAn\n')
    expect(parsed).toEqual({ rows: [expect.objectContaining({ line: 3, email: 'an@x.vn', name: 'An' })], errors: [] })
  })

  it('keeps separators, quotes and line breaks inside quoted fields and counts lines after them', () => {
    const text = 'email,name,title\nan@x.vn,"Nguyễn, An","Kỹ sư ""chính""\nca đêm"\nbinh@x.vn,Bình,\n'
    const parsed = parseStaffCsv(text)
    expect(parsed).toEqual({
      rows: [
        expect.objectContaining({ line: 2, name: 'Nguyễn, An', title: 'Kỹ sư "chính"\nca đêm' }),
        expect.objectContaining({ line: 4, email: 'binh@x.vn' })
      ],
      errors: []
    })
  })

  it('composes decomposed diacritics so names match what was typed in the app', () => {
    const parsed = parseStaffCsv('email,name\nan@x.vn,' + 'Nguyễn'.normalize('NFD') + '\n')
    expect('rows' in parsed && parsed.rows[0].name).toBe('Nguyễn')
  })

  it('skips blank lines and reports rows with a bad or missing email', () => {
    const parsed = parseStaffCsv('email,name,manager email\n\nnot-an-email,An,\n,Bình,\nchi@x.vn,Chi,boss\n,,\nduc@x.vn,Đức,\n')
    expect(parsed).toEqual({
      rows: [expect.objectContaining({ line: 7, email: 'duc@x.vn' })],
      errors: [
        { row: expect.objectContaining({ line: 3, name: 'An' }), problem: 'BadEmail' },
        { row: expect.objectContaining({ line: 4, name: 'Bình' }), problem: 'MissingEmail' },
        { row: expect.objectContaining({ line: 5, name: 'Chi' }), problem: 'BadManagerEmail' }
      ]
    })
  })

  it('rejects a file without an email column or without rows', () => {
    expect(parseStaffCsv('name,title\nAn,CEO\n')).toEqual({ fileError: 'NoEmailColumn' })
    expect(parseStaffCsv('﻿\r\n')).toEqual({ fileError: 'Empty' })
  })
})

describe('skippedRowsCsv', () => {
  it('writes rows with a reason column that parse back to the same people', () => {
    const rows = [
      { line: 3, name: 'Nguyễn, An', email: 'an@x.vn', title: 'Kỹ sư "chính"', department: 'Kỹ thuật', managerEmail: 'boss@x.vn' },
      { line: 5, name: 'Bình', email: 'not-an-email', title: '', department: '', managerEmail: '' }
    ]
    const text = skippedRowsCsv(
      [{ row: rows[0], reason: 'Quản lý không có trong tệp' }, { row: rows[1], reason: 'Email không hợp lệ' }],
      textOf('vi')
    )
    expect(text.split('\r\n')[0]).toBe('\uFEFFHọ tên,Email,Chức danh,Phòng ban,Email quản lý,Lý do')
    expect(text).toContain('"Kỹ sư ""chính""",Kỹ thuật,boss@x.vn,Quản lý không có trong tệp\r\n')
    const parsed = parseStaffCsv(text)
    expect(parsed).toEqual({
      rows: [{ ...rows[0], line: 2 }],
      errors: [{ row: { ...rows[1], line: 3 }, problem: 'BadEmail' }]
    })
  })

  it('uses headers the parser also reads in English', () => {
    const row = { line: 2, name: 'An', email: 'an@x.vn', title: 'CEO', department: 'Board', managerEmail: 'b@x.vn' }
    const parsed = parseStaffCsv(skippedRowsCsv([{ row, reason: 'Manager row is skipped' }], textOf('en')))
    expect(parsed).toEqual({ rows: [row], errors: [] })
  })
})
