import type { Json } from '../../http-json'
import { MAX_FIELDS, MAX_TEXT_LENGTH } from '../payload'
import { mrkdwnToMarkdown, parseSlackBody } from '../slack'

function payloadOf (body: Json, contentType = 'application/json'): ReturnType<typeof parseSlackBody> {
  return parseSlackBody(JSON.stringify(body), contentType)
}

describe('mrkdwn', () => {
  it('converts emphasis and links, leaving code alone', () => {
    expect(mrkdwnToMarkdown('*Build* _passed_ ~old~ on <https://ci.example.com/1|run 1>')).toBe(
      '**Build** *passed* ~~old~~ on [run 1](https://ci.example.com/1)'
    )
    expect(mrkdwnToMarkdown('see `*not bold*` and <https://x.example.com>')).toBe('see `*not bold*` and https://x.example.com')
  })

  it('decodes the three escaped characters and keeps mention tokens', () => {
    expect(mrkdwnToMarkdown('a &lt; b &amp;&amp; c &gt; d <@ana@company.com> <!here>')).toBe(
      'a < b && c > d <@ana@company.com> <!here>'
    )
  })
})

describe('Slack bodies', () => {
  it('reads a text-only body (n8n Slack node, curl)', () => {
    expect(payloadOf({ text: 'Workflow *done*' })).toEqual({ isValid: true, payload: { text: 'Workflow **done**', blocks: [] } })
  })

  it('shows blocks and hides top-level text when blocks render (GitHub Actions)', () => {
    const parsed = payloadOf({
      text: 'fallback only',
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Deploy of *main* finished' } }]
    })
    expect(parsed).toEqual({ isValid: true, payload: { text: 'Deploy of **main** finished', blocks: [] } })
  })

  it('falls back to text when no block renders', () => {
    const parsed = payloadOf({ text: 'Only this', blocks: [{ type: 'image', image_url: 'https://x.example.com/a.png' }] })
    expect(parsed).toEqual({ isValid: true, payload: { text: 'Only this', blocks: [] } })
  })

  it('maps header, fields, context, divider and link buttons (Uptime Kuma)', () => {
    const parsed = payloadOf({
      text: 'Kuma alert',
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: 'Uptime Kuma Alert' } },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*Message*\nsite down' },
            { type: 'mrkdwn', text: '*Time (UTC)*\n2026-09-27 10:00' }
          ]
        },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'from kuma-1' }] },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Open' }, url: 'https://kuma.example.com/1' },
            { type: 'button', text: { type: 'plain_text', text: 'Unsafe' }, url: 'http://kuma.example.com/1' }
          ]
        }
      ]
    })
    expect(parsed).toEqual({
      isValid: true,
      payload: {
        text: '### Uptime Kuma Alert\n\nfrom kuma-1\n\n---',
        blocks: [
          {
            type: 'fields',
            fields: [
              { label: 'Message', value: 'site down' },
              { label: 'Time (UTC)', value: '2026-09-27 10:00' }
            ]
          },
          { type: 'button', text: 'Open', url: 'https://kuma.example.com/1' }
        ]
      }
    })
  })

  it('reads legacy attachments after the text (Grafana)', () => {
    const parsed = payloadOf({
      text: 'Alert',
      attachments: [
        {
          color: 'danger',
          title: 'CPU high',
          title_link: 'https://grafana.example.com/d/1',
          text: 'Value *93%*',
          fields: [{ title: 'Host', value: 'db-1', short: true }],
          footer: 'Grafana'
        }
      ]
    })
    expect(parsed).toEqual({
      isValid: true,
      payload: {
        text: 'Alert\n\n### [CPU high](https://grafana.example.com/d/1)\n\nValue **93%**\n\nGrafana',
        blocks: [{ type: 'fields', fields: [{ label: 'Host', value: 'db-1' }] }],
        color: 'danger'
      }
    })
  })

  it('takes the first attachment color, with or without #', () => {
    const colorOf = (color: string): string | undefined => {
      const parsed = payloadOf({ text: 'x', attachments: [{ color }, { color: 'good' }] })
      return parsed.isValid ? parsed.payload.color : undefined
    }
    expect(colorOf('warning')).toBe('warning')
    expect(colorOf('#439FE0')).toBe('#439fe0')
    expect(colorOf('439FE0')).toBe('#439fe0')
    expect(colorOf('purple')).toBeUndefined()
  })

  it('reads the form-encoded payload= body', () => {
    const body = new URLSearchParams({ payload: JSON.stringify({ text: 'from a form' }) }).toString()
    expect(parseSlackBody(body, 'application/x-www-form-urlencoded')).toEqual({
      isValid: true,
      payload: { text: 'from a form', blocks: [] }
    })
  })

  it('truncates instead of rejecting', () => {
    const fields = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({ title: `F${i}`, value: 'v' }))
    const parsed = payloadOf({ text: 'x'.repeat(MAX_TEXT_LENGTH + 10), attachments: [{ fields }] })
    if (!parsed.isValid) throw new Error('expected a valid payload')
    expect(parsed.payload.text).toHaveLength(MAX_TEXT_LENGTH)
    expect(parsed.payload.text.endsWith('…')).toBe(true)
    expect(parsed.payload.blocks.map((block) => (block.type === 'fields' ? block.fields.length : 0))).toEqual([MAX_FIELDS, 1])
  })

  it('reads thread_key and reply_broadcast, ignores thread_ts and long keys', () => {
    expect(payloadOf({ text: 'x', thread_key: 'order-9', reply_broadcast: true, thread_ts: '1.2' })).toEqual({
      isValid: true,
      payload: { text: 'x', blocks: [], threadKey: 'order-9', replyBroadcast: true }
    })
    expect(payloadOf({ text: 'x', thread_key: 'k'.repeat(129) })).toEqual({ isValid: true, payload: { text: 'x', blocks: [] } })
  })

  it('rejects bodies that are not JSON objects or have nothing to show', () => {
    expect(parseSlackBody('{nope', 'application/json')).toEqual({ isValid: false, error: 'invalid_payload' })
    expect(parseSlackBody('payload=%7Bnope', 'application/x-www-form-urlencoded')).toEqual({
      isValid: false,
      error: 'invalid_payload'
    })
    expect(parseSlackBody('[]', 'application/json')).toEqual({ isValid: false, error: 'invalid_payload' })
    expect(payloadOf({ username: 'bot', blocks: [{ type: 'image' }] })).toEqual({ isValid: false, error: 'no_text' })
  })
})
