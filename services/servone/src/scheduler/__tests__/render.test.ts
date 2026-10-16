import { escapeHtml, renderDigest, renderUnsubscribePage, type DigestEmailInput } from '../email/render'

function input (overrides: Partial<DigestEmailInput> = {}): DigestEmailInput {
  return {
    locale: 'en',
    workspaceName: 'Acme & Co',
    total: 3,
    conversations: [
      {
        title: '#general',
        objectId: 'general' as DigestEmailInput['conversations'][number]['objectId'],
        objectClass: 'chunter:class:Channel',
        url: 'https://app.servone.vn/workbench/acme/notification/general|chunter:class:Channel',
        lines: [{ sender: 'Bob', snippet: '<script>alert(1)</script> hi' }],
        moreCount: 2
      }
    ],
    inboxUrl: 'https://app.servone.vn/workbench/acme/notification',
    unsubscribeUrl: 'https://notify.servone.vn/unsubscribe?token=a.b',
    ...overrides
  }
}

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml('<a href="x">\'&')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
  })
})

describe('renderDigest', () => {
  it('writes the English subject and footer', () => {
    const email = renderDigest(input())
    expect(email.subject).toBe('3 unread in Acme & Co')
    expect(email.html).toContain('You get this because email digest is on.')
    expect(email.html).toContain('>Turn it off</a>')
    expect(email.text).toContain('Turn it off: https://notify.servone.vn/unsubscribe?token=a.b')
  })

  it('writes the Vietnamese subject and footer', () => {
    const email = renderDigest(input({ locale: 'vi' }))
    expect(email.subject).toBe('3 tin chưa đọc trong Acme & Co')
    expect(email.html).toContain('Bạn nhận email này vì đã bật email tóm tắt.')
    expect(email.html).toContain('>Tắt email tóm tắt</a>')
    expect(email.html).toContain('và 2 tin khác')
  })

  it('escapes message text and names in the HTML', () => {
    const { html, text } = renderDigest(input())
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; hi')
    expect(html).toContain('Acme &amp; Co')
    expect(text).toContain('Bob: <script>alert(1)</script> hi')
  })
})

describe('renderUnsubscribePage', () => {
  it('asks in both languages and posts back with the token', () => {
    const html = renderUnsubscribePage({
      kind: 'confirm',
      workspaceName: 'Acme',
      actionUrl: '/unsubscribe?token=a.b&x=1'
    })
    expect(html).toContain('Tắt email tóm tắt cho Acme?')
    expect(html).toContain('Turn off the email digest for Acme?')
    expect(html).toContain('action="/unsubscribe?token=a.b&amp;x=1"')
  })

  it('confirms in both languages', () => {
    const html = renderUnsubscribePage({ kind: 'done', workspaceName: '<Acme>' })
    expect(html).toContain('Email digest is off for &lt;Acme&gt;.')
    expect(html).toContain('Đã tắt email tóm tắt cho &lt;Acme&gt;.')
    expect(html).not.toContain('<form')
  })
})
