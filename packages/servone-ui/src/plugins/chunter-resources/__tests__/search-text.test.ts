import { formatBytes, splitMatches } from '../search/text'

describe('splitMatches', () => {
  it('marks every query word case-insensitively', () => {
    expect(splitMatches('Deploy the Railway fix', 'railway deploy')).toEqual([
      { text: 'Deploy', isMatch: true },
      { text: ' the ', isMatch: false },
      { text: 'Railway', isMatch: true },
      { text: ' fix', isMatch: false }
    ])
  })

  it('keeps Vietnamese diacritics distinct and escapes regex characters', () => {
    expect(splitMatches('họp hop (a+b)', 'hop a+b').filter((p) => p.isMatch).map((p) => p.text)).toEqual(['hop', 'a+b'])
  })

  it('returns the text whole for an empty query', () => {
    expect(splitMatches('hello', '  ')).toEqual([{ text: 'hello', isMatch: false }])
  })
})

describe('formatBytes', () => {
  it('scales to the largest whole unit', () => {
    expect(formatBytes(28_890, 'en')).toBe('28 kB')
    expect(formatBytes(2_936_012, 'en')).toBe('2.8 MB')
  })
})
