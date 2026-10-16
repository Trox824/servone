import {
  parseCreatedWebhook,
  parseServiceUrl,
  parseWebhookCalls,
  parseWebhookSummaries,
  ServiceApiError,
  webhookColor,
  webhookName,
  webhookThread,
  type WebhookMessage
} from '../api'

jest.mock('@hcengineering/presentation', () => ({ __esModule: true, default: { metadata: { Token: 'token' } } }))
jest.mock('@hcengineering/platform', () => ({ getMetadata: () => 'token' }))
jest.mock('@hcengineering/analytics', () => ({ Analytics: { handleEvent: jest.fn() } }))

describe('webhook api parsing', () => {
  it('reads the hook list', () => {
    expect(
      parseWebhookSummaries({
        hooks: [
          {
            id: 'a',
            name: 'CI',
            createdBy: 'u1',
            createdOn: 5,
            revokedOn: null,
            lastCall: { at: 9, status: 200 },
            allowMentions: true,
            rateLimitedOn: 8
          },
          { id: 'b', name: 'Old', createdBy: 'u2', createdOn: 1, revokedOn: 3, lastCall: null, rateLimitedOn: null }
        ]
      })
    ).toEqual([
      {
        id: 'a',
        name: 'CI',
        createdBy: 'u1',
        createdOn: 5,
        revokedOn: undefined,
        lastCall: { at: 9, status: 200, count: undefined },
        allowMentions: true,
        rateLimitedOn: 8
      },
      {
        id: 'b',
        name: 'Old',
        createdBy: 'u2',
        createdOn: 1,
        revokedOn: 3,
        lastCall: undefined,
        allowMentions: false,
        rateLimitedOn: undefined
      }
    ])
  })

  it('rejects malformed responses', () => {
    expect(() => parseWebhookSummaries({ hooks: [{ id: 1 }] })).toThrow(ServiceApiError)
    expect(() => parseWebhookCalls({ calls: 'no' })).toThrow(ServiceApiError)
    expect(() => parseCreatedWebhook({ id: 'x' })).toThrow(ServiceApiError)
    expect(() => parseCreatedWebhook({ id: 'x', url: 'https://h/v1/hooks/x/s' })).toThrow(ServiceApiError)
  })

  it('reads the call log and created hook', () => {
    expect(parseWebhookCalls({ calls: [{ at: 1, status: 403 }, { at: 2, status: 429, count: 7 }] })).toEqual([
      { at: 1, status: 403, count: undefined },
      { at: 2, status: 429, count: 7 }
    ])
    expect(parseCreatedWebhook({ id: 'x', url: 'https://h/v1/hooks/x/s', slackUrl: 'https://h/v1/hooks/x/s/slack' })).toEqual({
      id: 'x',
      url: 'https://h/v1/hooks/x/s',
      slackUrl: 'https://h/v1/hooks/x/s/slack'
    })
  })

  it('reads the service URL from servone-config.json', () => {
    const key = 'SERVONE_WEBHOOKS_URL'
    expect(parseServiceUrl({ SERVONE_WEBHOOKS_URL: 'https://hooks.example/' }, key)).toBe('https://hooks.example')
    expect(parseServiceUrl({ SERVONE_WEBHOOKS_URL: '' }, key)).toBeUndefined()
    expect(parseServiceUrl({}, key)).toBeUndefined()
    expect(parseServiceUrl('x', key)).toBeUndefined()
  })

  it('finds the webhook name on a message', () => {
    expect(webhookName({ servoneWebhookName: undefined } as WebhookMessage)).toBeUndefined()
    expect(webhookName({ servoneWebhookName: '' } as WebhookMessage)).toBeUndefined()
    expect(webhookName({ servoneWebhookName: 'CI' } as WebhookMessage)).toBe('CI')
  })
})

describe('webhook color', () => {
  const colored = (servoneWebhookColor: string): WebhookMessage => ({ servoneWebhookColor }) as WebhookMessage

  it('maps named colors to theme tokens and keeps valid hex', () => {
    expect(webhookColor(colored('danger'))).toBe('var(--theme-state-negative-color)')
    expect(webhookColor(colored('warning'))).toBe('var(--theme-warning-color)')
    expect(webhookColor(colored('good'))).toBe('var(--theme-state-positive-color)')
    expect(webhookColor(colored('info'))).toBe('var(--theme-state-primary-color)')
    expect(webhookColor(colored('#36a64f'))).toBe('#36a64f')
  })

  it('ignores anything else', () => {
    expect(webhookColor(colored('toString'))).toBeUndefined()
    expect(webhookColor(colored('red;background:url(x)'))).toBeUndefined()
    expect(webhookColor({} as WebhookMessage)).toBeUndefined()
  })
})

describe('webhook thread link', () => {
  it('reads the parent of a broadcast copy', () => {
    expect(webhookThread({ servoneWebhookThread: 'msg-1' } as WebhookMessage)).toBe('msg-1')
    expect(webhookThread({ servoneWebhookThread: '' } as WebhookMessage)).toBeUndefined()
    expect(webhookThread({} as WebhookMessage)).toBeUndefined()
  })
})
