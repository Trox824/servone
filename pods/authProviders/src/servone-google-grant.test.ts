import { type AccountDB } from '@hcengineering/account'
import { type PersonId } from '@hcengineering/core'
import { GOOGLE_SIGNUP_KIND, saveGoogleSignupGrant } from './servone-google-grant'

const socialId = 'social-1' as PersonId

function createDb (existing: object | null): { db: AccountDB, insertOne: jest.Mock, update: jest.Mock } {
  const insertOne = jest.fn()
  const update = jest.fn()
  const db = { integrationSecret: { findOne: jest.fn().mockResolvedValue(existing), insertOne, update } } as unknown as AccountDB
  return { db, insertOne, update }
}

describe('saveGoogleSignupGrant', () => {
  const secretKey = { socialId, kind: GOOGLE_SIGNUP_KIND, workspaceUuid: null, key: 'a@b.com' }

  it('inserts the grant when Google returned a refresh token', async () => {
    const { db, insertOne, update } = createDb(null)
    await saveGoogleSignupGrant(db, socialId, 'a@b.com', 'rt-1', 'mail cal')
    expect(insertOne).toHaveBeenCalledWith({ ...secretKey, secret: JSON.stringify({ refresh_token: 'rt-1', scope: 'mail cal' }) })
    expect(update).not.toHaveBeenCalled()
  })

  it('does nothing without a refresh token', async () => {
    const { db, insertOne, update } = createDb({})
    await saveGoogleSignupGrant(db, socialId, 'a@b.com', undefined, 'mail cal')
    expect(insertOne).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('replaces an older grant', async () => {
    const { db, insertOne, update } = createDb({ secret: 'old' })
    await saveGoogleSignupGrant(db, socialId, 'a@b.com', 'rt-2', 'mail')
    expect(update).toHaveBeenCalledWith(secretKey, { secret: JSON.stringify({ refresh_token: 'rt-2', scope: 'mail' }) })
    expect(insertOne).not.toHaveBeenCalled()
  })
})
