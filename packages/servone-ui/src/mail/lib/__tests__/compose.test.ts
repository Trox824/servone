import type { Ref } from '@hcengineering/core'
import type { MailMessageCard, MailThreadCard } from '@servone/mail'
import { forwardSubject, parseAddressList, quotableHtml, replySubject, seedFor } from '../compose'

function message (overrides: Partial<MailMessageCard>): MailMessageCard {
  return {
    _id: 'msg1' as Ref<MailMessageCard>,
    _class: 'mail:class:MailMessage' as MailMessageCard['_class'],
    space: 'space1' as MailMessageCard['space'],
    modifiedOn: 0,
    modifiedBy: 'user1' as MailMessageCard['modifiedBy'],
    title: 'Subject',
    content: 'blob1' as MailMessageCard['content'],
    blobs: {},
    parentInfo: [],
    rank: '0|100000:',
    mailThread: 'thread1' as Ref<MailThreadCard>,
    mailMessageId: '',
    mailInReplyTo: '',
    mailReferences: [],
    mailFrom: '',
    mailTo: [],
    mailCc: [],
    mailBcc: [],
    mailSentAt: 0,
    mailSnippet: '',
    mailIsRead: false,
    mailIsStarred: false,
    mailIsDraft: false,
    mailLocations: [],
    mailFolders: [],
    mailProviderMessageId: '',
    mailBodyBlob: '',
    mailRawBlob: '',
    mailHasAttachments: false,
    mailTargetFolder: null,
    mailIsDeleted: false,
    ...overrides
  }
}

it('replies to the sender, or to the recipients of my own sent mail', () => {
  expect(seedFor('reply', message({ mailFrom: 'An <an@x.vn>', mailTo: ['me@x.vn'] }), '', 'me@x.vn', 'vi').to).toEqual(['An <an@x.vn>'])
  expect(seedFor('reply', message({ mailFrom: 'me@x.vn', mailTo: ['b@x.vn'] }), '', 'me@x.vn', 'vi').to).toEqual(['b@x.vn'])
})

it('reply all keeps everyone but me, once', () => {
  const seed = seedFor('replyAll', message({ mailFrom: 'an@x.vn', mailTo: ['me@x.vn', 'b@x.vn'], mailCc: ['an@x.vn', 'c@x.vn'] }), '', 'me@x.vn', 'vi')
  expect(seed.to).toEqual(['an@x.vn', 'b@x.vn'])
  expect(seed.cc).toEqual(['c@x.vn'])
})

it('threads the reply and does not double the prefix', () => {
  const seed = seedFor('reply', message({ title: 'TR: Báo giá', mailMessageId: '<m1@x>', mailReferences: ['<m0@x>'] }), '', 'me@x.vn', 'vi')
  expect(seed.subject).toBe('TR: Báo giá')
  expect(seed.inReplyTo).toBe('<m1@x>')
  expect(seed.references).toEqual(['<m0@x>', '<m1@x>'])
  expect(replySubject('Báo giá')).toBe('Re: Báo giá')
})

it('forward leaves the recipients empty and carries no thread headers', () => {
  const seed = seedFor('forward', message({ title: 'Báo giá', mailMessageId: '<m1@x>', mailFrom: 'an@x.vn', mailTo: ['me@x.vn'] }), '<p>hi</p>', 'me@x.vn', 'vi')
  expect(seed.to).toEqual([])
  expect(seed.inReplyTo).toBe('')
  expect(seed.references).toEqual([])
  expect(forwardSubject('Báo giá')).toBe('Fwd: Báo giá')
})

it('escapes an attacker-controlled From header before quoting it', () => {
  const seed = seedFor('reply', message({ mailFrom: '<img src=x onerror=alert(1)>', mailTo: ['me@x.vn'] }), '<p>x</p>', 'me@x.vn', 'en')
  expect(seed.quoteHtml).not.toMatch(/<img[\s>]/i)
  expect(seed.quoteHtml).toMatch(/&lt;img src=x onerror=alert\(1\)&gt;/)
})

it('quotes the parent with remote images blocked and scripts stripped', () => {
  const html = '<style>p{color:red}</style><p onclick="x()">Hi</p><img src="https://t.example/p.gif"><script>alert(1)</script>'
  const seed = seedFor('reply', message({ mailFrom: 'an@x.vn', mailTo: ['me@x.vn'] }), html, 'me@x.vn', 'en')
  expect(seed.quoteHtml).toMatch(/<blockquote>.*Hi/)
  expect(seed.quoteHtml).not.toMatch(/https:\/\/t\.example|<script|onclick|color:red/)
  expect(quotableHtml('<img srcset="https://t.example/a.png 2x">')).not.toMatch(/https:/)
})

it('quotes nothing when the parent body is not available', () => {
  expect(seedFor('reply', message({ mailFrom: 'an@x.vn', mailTo: ['me@x.vn'] }), '', 'me@x.vn', 'en').quoteHtml).toBe('')
  expect(seedFor('forward', message({ title: 'Báo giá' }), '', 'me@x.vn', 'en').quoteHtml).toBe('')
})

it('splits typed addresses', () => {
  expect(parseAddressList('an@x.vn, Bình <b@x.vn>;\nc@x.vn,,')).toEqual(['an@x.vn', 'Bình <b@x.vn>', 'c@x.vn'])
})
