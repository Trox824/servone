import { callApi, ConnectorError } from '../../connectors/api'
import { htmlToMarkdown } from '../../connectors/html'
import type { ApiResponse } from '../../types'

describe('callApi', () => {
  it('retries a rate-limited call, then returns the body', async () => {
    const answers: ApiResponse[] = [{ status: 429, body: null, retryAfterSeconds: 0 }, { status: 200, body: { ok: true } }]
    const api = jest.fn(async () => answers.shift() as ApiResponse)
    await expect(callApi(api, { method: 'GET', path: '/x' }, new AbortController().signal)).resolves.toEqual({ ok: true })
    expect(api).toHaveBeenCalledTimes(2)
  })

  it('throws on an error status', async () => {
    const api = async (): Promise<ApiResponse> => ({ status: 403, body: null })
    await expect(callApi(api, { method: 'GET', path: '/x' }, new AbortController().signal)).rejects.toEqual(new ConnectorError(403, '/x'))
  })
})

describe('htmlToMarkdown', () => {
  it('keeps formatting and replaces images with a placeholder', () => {
    expect(htmlToMarkdown('<p>Hi <strong>team</strong></p><img alt="chart"><ul><li>one</li></ul>')).toBe('Hi **team**\n\n[image: chart]\n\n-   one')
  })
})
