import type { ApiCall, ApiRequest, Json } from '../types'

const MAX_ATTEMPTS = 5
const DEFAULT_RETRY_SECONDS = 2

export class ConnectorError extends Error {
  constructor (readonly status: number, readonly path: string) {
    super(`${path} answered ${status}`)
  }
}

export class ImportAbortedError extends Error {
  constructor () {
    super('Import stopped')
  }
}

async function wait (seconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, seconds * 1000)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new ImportAbortedError())
    }, { once: true })
  })
}

export async function callApi (api: ApiCall, request: ApiRequest, signal: AbortSignal): Promise<Json> {
  for (let attempt = 1; ; attempt++) {
    if (signal.aborted) throw new ImportAbortedError()
    const response = await api(request)
    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      await wait(response.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS * attempt, signal)
      continue
    }
    if (response.status < 200 || response.status >= 300) throw new ConnectorError(response.status, request.path)
    return response.body
  }
}
