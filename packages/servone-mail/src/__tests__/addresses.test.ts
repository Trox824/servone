import { emailsOf, formatAddress, parseAddress } from '../addresses'

describe('addresses', () => {
  it('round-trips a name with diacritics', () => {
    const text = formatAddress({ name: 'Nguyễn Thị Linh', email: 'linh@example.vn' })
    expect(text).toBe('Nguyễn Thị Linh <linh@example.vn>')
    expect(parseAddress(text)).toEqual({ name: 'Nguyễn Thị Linh', email: 'linh@example.vn' })
  })

  it('quotes names with commas', () => {
    const text = formatAddress({ name: 'Tran, An', email: 'an@example.vn' })
    expect(text).toBe('"Tran, An" <an@example.vn>')
    expect(parseAddress(text)).toEqual({ name: 'Tran, An', email: 'an@example.vn' })
  })

  it('keeps a bare address', () => {
    expect(formatAddress({ name: '', email: 'x@example.vn' })).toBe('x@example.vn')
    expect(parseAddress('X@Example.VN')).toEqual({ name: '', email: 'x@example.vn' })
  })

  it('lists unique lowercase emails', () => {
    expect(emailsOf(['A <a@x.vn>', 'a@X.vn', 'b@x.vn'])).toEqual(['a@x.vn', 'b@x.vn'])
  })
})
