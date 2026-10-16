import { parseEmails } from '../emails'
import { suggestWorkspaceName } from '../workspace-name'

describe('parseEmails', () => {
  it('splits on commas, semicolons and new lines, lowercases and dedupes', () => {
    expect(parseEmails('An@acme.vn, binh@acme.vn;\nan@acme.vn').valid).toEqual(['an@acme.vn', 'binh@acme.vn'])
  })
  it('reports entries that are not emails', () => {
    expect(parseEmails('an@acme.vn nope, x@y').invalid).toEqual(['nope', 'x@y'])
  })
  it('gives nothing for blank text', () => {
    expect(parseEmails(' \n ')).toEqual({ valid: [], invalid: [] })
  })
})

describe('suggestWorkspaceName', () => {
  it.each([
    ['an@acme.vn', 'Acme'],
    ['an@mail.acme.com', 'Acme'],
    ['an@acme.co.uk', 'Acme'],
    ['an@gmail.com', ''],
    ['an@yahoo.com.vn', ''],
    ['an@outlook.com', ''],
    ['an@icloud.com', ''],
    ['an@proton.me', ''],
    ['not-an-email', '']
  ])('%s gives "%s"', (email, expected) => {
    expect(suggestWorkspaceName(email)).toBe(expected)
  })
})
