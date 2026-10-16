import { inboxGroupOf, parseExportArchive } from '../notice'

describe('parseExportArchive', () => {
  it('reads the class label, format and time from a pod-export archive name', () => {
    expect(
      parseExportArchive('export-297d5ebd-205e-40ca-8bf7-1f6a977a37ad-tracker:string:Issue-json-1790745236101.zip')
    ).toEqual({ classLabel: 'tracker:string:Issue', format: 'JSON', createdOn: 1790745236101 })
  })

  it('leaves any other file name alone', () => {
    expect(parseExportArchive('Báo cáo tháng 9.zip')).toBeUndefined()
  })
})

describe('inboxGroupOf', () => {
  const now = new Date(2026, 9, 4, 12, 0)

  it('splits by start of today and the last seven days', () => {
    expect(inboxGroupOf(new Date(2026, 9, 4, 0, 1), now)).toBe('today')
    expect(inboxGroupOf(new Date(2026, 9, 3, 23, 59), now)).toBe('week')
    expect(inboxGroupOf(new Date(2026, 8, 28, 0, 0), now)).toBe('week')
    expect(inboxGroupOf(new Date(2026, 8, 27, 23, 59), now)).toBe('earlier')
  })
})
