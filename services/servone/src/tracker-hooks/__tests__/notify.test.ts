import { MAX_CONSECUTIVE_FAILURES } from '../dispatcher'
import { disabledEmail } from '../notify'
import type { AttemptRecord } from '../store'
import { storedHook } from './fixtures'

const TURNED_OFF_AT = Date.UTC(2026, 8, 27, 9, 20)
const HOOKS_PAGE = 'https://app.servone.vn/workbench/servone/tracker/project-srv/more?tab=webhooks'

function lastAttempt (overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    at: TURNED_OFF_AT,
    deliveryId: 'd',
    event: 'issue.created',
    attempt: 3,
    status: 500,
    durationMs: 40,
    responseStart: '',
    ...overrides
  }
}

describe('disabledEmail', () => {
  const hook = storedHook('hook1', {
    url: 'https://hooks.example.com/in/abc?token=private',
    disabledOn: TURNED_OFF_AT,
    disabledReason: 'failures',
    consecutiveFailures: MAX_CONSECUTIVE_FAILURES
  })

  it('names the project, the receiver, the time, the last answer and the page to fix it', () => {
    const email = disabledEmail(hook, lastAttempt(), 'SRV', HOOKS_PAGE)
    expect(email.subject).toBe('Webhook turned off in SRV')
    expect(email.text).toBe(
      'The webhook to https://hooks.example.com/in/abc failed 20 times in a row and was turned off on ' +
        '27 Sep 2026 09:20 UTC. Last answer: 500.\n\n' +
        `Open the project's webhooks to see the log and turn it back on: ${HOOKS_PAGE}\n`
    )
  })

  it('keeps the query string out, since it may carry a token', () => {
    expect(disabledEmail(hook, lastAttempt(), 'SRV', HOOKS_PAGE).text).not.toContain('private')
  })

  it('gives the error when there was no HTTP answer', () => {
    const email = disabledEmail(hook, lastAttempt({ status: 0, error: 'timeout' }), 'SRV', HOOKS_PAGE)
    expect(email.text).toContain('Last answer: timeout.')
  })
})
