import { simpleParser } from 'mailparser'
import { buildMime, newMessageId } from '../smtp'

describe('buildMime', () => {
  it('writes threading headers and a Message-ID on the sender domain', async () => {
    const messageId = newMessageId('Linh <linh@acme.vn>')
    expect(messageId).toMatch(/^<.+@acme\.vn>$/)
    const raw = await buildMime({
      from: 'Linh <linh@acme.vn>', to: ['khach@example.vn'], cc: [], bcc: ['sep@acme.vn'], subject: 'Re: Báo giá',
      html: '<p>Đồng ý</p>', text: 'Đồng ý', messageId, inReplyTo: '<m2@x>', references: ['<m1@x>', '<m2@x>'], attachments: []
    })
    const parsed = await simpleParser(raw)
    expect(parsed.messageId).toBe(messageId)
    expect(parsed.inReplyTo).toBe('<m2@x>')
    expect(parsed.references).toEqual(['<m1@x>', '<m2@x>'])
    expect(parsed.subject).toBe('Re: Báo giá')
    expect(raw.toString()).not.toContain('sep@acme.vn')
  })
})
