import { displayName, fullTime, listTime, participantsLine, recipientNames } from '../format'

describe('displayName', () => {
  it('prefers the display name, falling back to the local part of the address', () => {
    expect(displayName('An <an@x.vn>')).toBe('An')
    expect(displayName('an@x.vn')).toBe('an')
  })
})

describe('participantsLine', () => {
  it('names participants, me last, capped at three', () => {
    expect(participantsLine(['An <an@x.vn>', 'me@x.vn', 'Bình <b@x.vn>', 'c@x.vn', 'd@x.vn'], 'me@x.vn', 'tôi')).toBe('An, Bình, c +2')
    expect(participantsLine(['me@x.vn'], 'me@x.vn', 'tôi')).toBe('tôi')
    expect(participantsLine(['noreply@x.vn', 'me@x.vn'], 'me@x.vn', 'tôi')).toBe('noreply, tôi')
  })
})

describe('listTime', () => {
  it('formats list time relative to now', () => {
    const now = Date.UTC(2026, 8, 27, 8, 0)
    const sentAt = Date.UTC(2026, 8, 27, 7, 5)
    expect(listTime(sentAt, now, 'en')).toBe(new Date(sentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
    expect(listTime(Date.UTC(2026, 8, 20, 7, 5), now, 'vi')).toBe('20 thg 9')
    expect(listTime(Date.UTC(2025, 8, 20, 7, 5), now, 'vi')).toBe('20/09/2025')
  })
})

describe('listTime formatter cache', () => {
  it('builds each locale formatter once across calls', () => {
    const spy = jest.spyOn(Intl, 'DateTimeFormat')
    const now = Date.UTC(2026, 8, 27, 8, 0)
    listTime(Date.UTC(2026, 8, 27, 7, 5), now, 'en')
    const afterFirst = spy.mock.calls.length
    listTime(Date.UTC(2026, 8, 27, 6, 5), now, 'en')
    listTime(Date.UTC(2026, 8, 27, 5, 5), now, 'en')
    expect(spy.mock.calls.length).toBe(afterFirst)
    spy.mockRestore()
  })
})

describe('recipientNames', () => {
  it('says "me" for the mailbox owner and names everyone else', () => {
    expect(recipientNames(['Me <me@acme.vn>'], 'me@acme.vn', 'me')).toEqual(['me'])
    expect(recipientNames(['Lan <lan@acme.vn>', 'ME@acme.vn'], 'me@acme.vn', 'me')).toEqual(['Lan', 'me'])
  })
})

describe('fullTime', () => {
  it('spells out the date and time for a hover title', () => {
    expect(fullTime(Date.UTC(2026, 8, 27, 7, 5), 'en')).toMatch(/September 27, 2026/)
  })
})
