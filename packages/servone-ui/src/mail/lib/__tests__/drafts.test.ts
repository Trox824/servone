import type { Ref } from '@hcengineering/core'
import type { MailMessageCard, MailThreadCard } from '@servone/mail'
import { canSendDraft, continuedDraftMode, discardNeedsConfirm, discardStep, draftBodySource, draftCardFields, draftChanges, totalAttachmentBytes } from '../drafts'
import { account, message } from './builders'

describe('draftCardFields', () => {
  it('builds a draft card from the account and the typed fields', () => {
    const fields = draftCardFields(
      account({ mailEmail: 'me@x.vn', mailDisplayName: 'Linh' }),
      't1' as Ref<MailThreadCard>,
      { to: ['an@x.vn'], cc: [], bcc: [], subject: 'Re: Báo giá', html: '<p>Chào anh</p>', inReplyTo: '<m1@x>', references: ['<m1@x>'] },
      'blob-1'
    )
    expect(fields).toMatchObject({
      mailFrom: 'Linh <me@x.vn>',
      mailTo: ['an@x.vn'],
      mailIsDraft: true,
      mailBodyBlob: 'blob-1',
      mailInReplyTo: '<m1@x>',
      mailSnippet: 'Chào anh',
      mailTargetFolder: null
    })
  })
})

describe('draftChanges', () => {
  it('updates only what changed', () => {
    const previous: MailMessageCard = message({ _id: 'd1' as Ref<MailMessageCard>, mailTo: ['an@x.vn'], mailBodyBlob: 'b1', title: 'Báo giá' })
    expect(
      draftChanges(previous, { to: ['an@x.vn'], cc: [], bcc: [], subject: 'Báo giá', html: '<p>x</p>', inReplyTo: '', references: [] }, 'b2')
    ).toEqual({ mailBodyBlob: 'b2', mailSnippet: 'x' })
  })
})

describe('discardStep', () => {
  it('leaves removal of a draft the provider holds to push, so the provider copy is expunged', () => {
    expect(discardStep(message({ mailLocations: ['f1:12'] }), 0)).toBe('markDeleted')
  })

  it('removes a local-only draft, and its thread when nothing else is in it', () => {
    expect(discardStep(message({ mailLocations: [] }), 0)).toBe('removeCardAndThread')
    expect(discardStep(message({ mailLocations: [] }), 2)).toBe('removeCard')
  })
})

describe('totalAttachmentBytes', () => {
  it('sums attachment sizes', () => {
    expect(totalAttachmentBytes([100, 200, 300])).toBe(600)
    expect(totalAttachmentBytes([])).toBe(0)
  })
})

describe('draftBodySource', () => {
  it('fetches a pulled draft from the provider before the editor may load it', () => {
    expect(draftBodySource(message({ mailBodyBlob: '', mailRawBlob: '', mailLocations: ['f1:12'] }))).toBe('provider')
  })

  it('loads a stored body blob, refuses a raw-only body, and treats a never-saved local draft as empty', () => {
    expect(draftBodySource(message({ mailBodyBlob: 'b1', mailLocations: ['f1:12'] }))).toBe('blob')
    expect(draftBodySource(message({ mailBodyBlob: '', mailRawBlob: 'r1', mailLocations: ['f1:12'] }))).toBe('unreadable')
    expect(draftBodySource(message({ mailBodyBlob: '', mailRawBlob: '', mailLocations: [] }))).toBe('none')
  })
})

describe('draft body gating', () => {
  it('blocks send while the body is loading or failed, and while a send runs', () => {
    expect(canSendDraft('loading', false)).toBe(false)
    expect(canSendDraft('failed', false)).toBe(false)
    expect(canSendDraft('ready', true)).toBe(false)
    expect(canSendDraft('ready', false)).toBe(true)
  })

  it('asks before discarding a body the user has not seen yet', () => {
    expect(discardNeedsConfirm(true, 'loading')).toBe(true)
    expect(discardNeedsConfirm(true, 'failed')).toBe(true)
    expect(discardNeedsConfirm(true, 'ready')).toBe(false)
    expect(discardNeedsConfirm(false, 'ready')).toBe(true)
  })
})

describe('continuedDraftMode', () => {
  it('reopens a forward draft as a forward so its subject stays editable', () => {
    expect(continuedDraftMode(message({ mailInReplyTo: '' }), true)).toBe('forward')
    expect(continuedDraftMode(message({ mailInReplyTo: '<m1@x>' }), true)).toBe('reply')
    expect(continuedDraftMode(message({ mailInReplyTo: '' }), false)).toBe('new')
  })
})
