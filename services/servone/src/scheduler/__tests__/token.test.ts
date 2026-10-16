import type { AccountUuid, WorkspaceUuid } from '@hcengineering/core'

import { readUnsubscribeToken, signUnsubscribeToken } from '../token'

const claim = { user: 'ann' as AccountUuid, workspace: 'acme' as WorkspaceUuid }

describe('unsubscribe token', () => {
  it('round-trips', () => {
    expect(readUnsubscribeToken(signUnsubscribeToken(claim, 'secret'), 'secret')).toEqual(claim)
  })

  it('rejects another secret', () => {
    expect(readUnsubscribeToken(signUnsubscribeToken(claim, 'secret'), 'other')).toBeUndefined()
  })

  it('rejects a changed payload', () => {
    const [, signature] = signUnsubscribeToken(claim, 'secret').split('.')
    const forged = Buffer.from(JSON.stringify({ p: 'digest-off', u: 'eve', w: 'acme' })).toString('base64url')
    expect(readUnsubscribeToken(`${forged}.${signature}`, 'secret')).toBeUndefined()
  })

  it('rejects garbage', () => {
    expect(readUnsubscribeToken('', 'secret')).toBeUndefined()
    expect(readUnsubscribeToken('a.b.c', 'secret')).toBeUndefined()
    expect(readUnsubscribeToken('not-a-token', 'secret')).toBeUndefined()
  })
})
