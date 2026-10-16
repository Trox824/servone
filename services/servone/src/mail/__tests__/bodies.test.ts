import { makeSnippet } from '../bodies'

describe('makeSnippet', () => {
  it('collapses whitespace and cuts at 200 characters', () => {
    const snippet = makeSnippet(`Chào anh,\n\n  em gửi ${'báo giá '.repeat(40)}`)
    expect(snippet.startsWith('Chào anh, em gửi báo giá')).toBe(true)
    expect(snippet.length).toBe(200)
  })

  it('drops quoted reply lines', () => {
    expect(makeSnippet('Đồng ý.\n> On Mon, Khach wrote:\n> Báo giá?')).toBe('Đồng ý.')
  })
})
