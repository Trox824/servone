import type { MailAccountCard } from '@servone/mail'
import { accountBanner } from '../banner'

function account (overrides: Partial<MailAccountCard>): MailAccountCard {
  return {
    _id: 'acc1' as MailAccountCard['_id'],
    _class: 'mail:class:MailAccount' as MailAccountCard['_class'],
    space: 'space1' as MailAccountCard['space'],
    modifiedOn: 0,
    modifiedBy: 'user1' as MailAccountCard['modifiedBy'],
    title: 'Mailbox',
    content: 'blob1' as MailAccountCard['content'],
    blobs: {},
    parentInfo: [],
    rank: '0|100000:',
    mailEmail: 'a@x.vn',
    mailDisplayName: 'A',
    mailProvider: 'other',
    mailAuthKind: 'password',
    mailStatus: 'ready',
    mailLastError: '',
    mailBackfillDone: 0,
    mailBackfillTotal: 0,
    mailLastSyncAt: 0,
    ...overrides
  }
}

it('names the preset host when offline', () => {
  expect(accountBanner(account({ mailStatus: 'offline', mailProvider: 'gmail' }))).toEqual({ kind: 'offline', host: 'imap.gmail.com' })
})

it('parses the host from the connect error for a custom provider', () => {
  expect(accountBanner(account({ mailStatus: 'offline', mailProvider: 'other', mailLastError: 'connect ECONNREFUSED mail.acme.vn:993', mailEmail: 'a@acme.vn' })))
    .toEqual({ kind: 'offline', host: 'mail.acme.vn' })
})

it('falls back to the email domain when the error has no host', () => {
  expect(accountBanner(account({ mailStatus: 'offline', mailProvider: 'other', mailLastError: 'timeout', mailEmail: 'a@acme.vn' })))
    .toEqual({ kind: 'offline', host: 'acme.vn' })
})

it('asks to reconnect on auth-error and shows backfill progress', () => {
  expect(accountBanner(account({ mailStatus: 'auth-error', mailEmail: 'a@gmail.com' }))).toEqual({ kind: 'authError', email: 'a@gmail.com' })
  expect(accountBanner(account({ mailStatus: 'backfilling', mailBackfillDone: 40, mailBackfillTotal: 120 }))).toEqual({ kind: 'backfill', done: 40, total: 120 })
  expect(accountBanner(account({ mailStatus: 'ready' }))).toEqual({ kind: 'none' })
})
