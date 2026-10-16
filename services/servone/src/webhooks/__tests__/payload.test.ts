import { MAX_BLOCKS, MAX_TEXT_LENGTH, MAX_THREAD_KEY_LENGTH, parsePayload } from '../payload'

function rejection (body: unknown): { error: string, field: string } | undefined {
  const parsed = parsePayload(JSON.stringify(body))
  return parsed.isValid ? undefined : { error: parsed.error, field: parsed.field }
}

describe('payload v1', () => {
  it('accepts text with every block type', () => {
    const parsed = parsePayload(
      JSON.stringify({
        text: 'Deploy **done**',
        blocks: [
          { type: 'heading', text: 'Build 42' },
          { type: 'fields', fields: [{ label: 'Branch', value: 'develop' }] },
          { type: 'button', text: 'Open', url: 'https://ci.example.com/42' }
        ]
      })
    )
    expect(parsed).toEqual({
      isValid: true,
      payload: {
        text: 'Deploy **done**',
        blocks: [
          { type: 'heading', text: 'Build 42' },
          { type: 'fields', fields: [{ label: 'Branch', value: 'develop' }] },
          { type: 'button', text: 'Open', url: 'https://ci.example.com/42' }
        ]
      }
    })
  })

  it('defaults blocks to none', () => {
    expect(parsePayload('{"text":"hi"}')).toEqual({ isValid: true, payload: { text: 'hi', blocks: [] } })
  })

  it('names the failing field', () => {
    expect(parsePayload('{nope')).toEqual({ isValid: false, error: 'invalid_json', field: 'body' })
    expect(rejection([])).toEqual({ error: 'invalid_type', field: 'body' })
    expect(rejection({})).toEqual({ error: 'missing_field', field: 'text' })
    expect(rejection({ text: 5 })).toEqual({ error: 'invalid_type', field: 'text' })
    expect(rejection({ text: '   ' })).toEqual({ error: 'empty', field: 'text' })
    expect(rejection({ text: 'x'.repeat(MAX_TEXT_LENGTH + 1) })).toEqual({ error: 'too_long', field: 'text' })
    expect(rejection({ text: 'hi', username: 'root' })).toEqual({ error: 'unknown_field', field: 'username' })
  })

  it('reads an optional color', () => {
    expect(parsePayload('{"text":"hi","color":"danger"}')).toEqual({
      isValid: true,
      payload: { text: 'hi', blocks: [], color: 'danger' }
    })
    expect(parsePayload('{"text":"hi","color":"#36A64F"}')).toEqual({
      isValid: true,
      payload: { text: 'hi', blocks: [], color: '#36a64f' }
    })
    expect(rejection({ text: 'hi', color: 'red' })).toEqual({ error: 'invalid_color', field: 'color' })
    expect(rejection({ text: 'hi', color: 5 })).toEqual({ error: 'invalid_type', field: 'color' })
  })

  it('reads thread_key and reply_broadcast', () => {
    expect(parsePayload('{"text":"hi","thread_key":"build-412","reply_broadcast":true}')).toEqual({
      isValid: true,
      payload: { text: 'hi', blocks: [], threadKey: 'build-412', replyBroadcast: true }
    })
    expect(rejection({ text: 'hi', thread_key: 'x'.repeat(MAX_THREAD_KEY_LENGTH + 1) })).toEqual({
      error: 'too_long',
      field: 'thread_key'
    })
    expect(rejection({ text: 'hi', thread_key: ' ' })).toEqual({ error: 'empty', field: 'thread_key' })
    expect(rejection({ text: 'hi', reply_broadcast: 'yes' })).toEqual({ error: 'invalid_type', field: 'reply_broadcast' })
  })

  it('accepts text at the length limit', () => {
    expect(parsePayload(JSON.stringify({ text: 'x'.repeat(MAX_TEXT_LENGTH) })).isValid).toBe(true)
  })

  it('checks blocks strictly', () => {
    const block = (b: unknown): unknown => ({ text: 'hi', blocks: [b] })
    expect(rejection({ text: 'hi', blocks: {} })).toEqual({ error: 'invalid_type', field: 'blocks' })
    expect(rejection({ text: 'hi', blocks: Array(MAX_BLOCKS + 1).fill({ type: 'heading', text: 'h' }) })).toEqual({
      error: 'too_many',
      field: 'blocks'
    })
    expect(rejection(block({ type: 'image', url: 'https://x' }))).toEqual({ error: 'invalid_type', field: 'blocks[0].type' })
    expect(rejection(block({ text: 'h' }))).toEqual({ error: 'missing_field', field: 'blocks[0].type' })
    expect(rejection(block({ type: 'heading', text: 'h', level: 1 }))).toEqual({
      error: 'unknown_field',
      field: 'blocks[0].level'
    })
    expect(rejection(block({ type: 'heading', text: 'h'.repeat(151) }))).toEqual({
      error: 'too_long',
      field: 'blocks[0].text'
    })
    expect(rejection(block({ type: 'fields', fields: [] }))).toEqual({ error: 'empty', field: 'blocks[0].fields' })
    expect(rejection(block({ type: 'fields', fields: Array(11).fill({ label: 'a', value: 'b' }) }))).toEqual({
      error: 'too_many',
      field: 'blocks[0].fields'
    })
    expect(rejection(block({ type: 'fields', fields: [{ label: 'a'.repeat(51), value: 'b' }] }))).toEqual({
      error: 'too_long',
      field: 'blocks[0].fields[0].label'
    })
    expect(rejection(block({ type: 'fields', fields: [{ label: 'a', value: 'b'.repeat(301) }] }))).toEqual({
      error: 'too_long',
      field: 'blocks[0].fields[0].value'
    })
    expect(rejection(block({ type: 'button', text: 'b'.repeat(41), url: 'https://x.io' }))).toEqual({
      error: 'too_long',
      field: 'blocks[0].text'
    })
  })

  it('allows only https button links', () => {
    const button = (url: string): unknown => ({ text: 'hi', blocks: [{ type: 'button', text: 'Open', url }] })
    expect(rejection(button('http://example.com'))).toEqual({ error: 'invalid_url', field: 'blocks[0].url' })
    expect(rejection(button('javascript:alert(1)'))).toEqual({ error: 'invalid_url', field: 'blocks[0].url' })
    expect(rejection(button('not a url'))).toEqual({ error: 'invalid_url', field: 'blocks[0].url' })
    expect(rejection(button('https://example.com/a?b=1'))).toBeUndefined()
  })
})
