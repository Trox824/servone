import { getClientIp } from '../ip-limit'

describe('getClientIp', () => {
  it('takes the last entry the edge appended', () => {
    expect(getClientIp('6.6.6.6, 1.2.3.4', '10.0.0.1')).toBe('1.2.3.4')
    expect(getClientIp(['6.6.6.6', '1.2.3.4'], '10.0.0.1')).toBe('1.2.3.4')
  })

  it('falls back to the socket address without the header', () => {
    expect(getClientIp(undefined, '10.0.0.1')).toBe('10.0.0.1')
    expect(getClientIp('', '10.0.0.1')).toBe('10.0.0.1')
  })
})
