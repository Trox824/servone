import card from '@hcengineering/card'
import core, { AccountRole } from '@hcengineering/core'
import setting from '@hcengineering/setting'
import { getChange, listChanges, parseChangeId, saveDraft } from '../changes'
import { describe as describeConfig } from '../describe'
import { CHANGE_SPACE, CHANGE_TYPE } from '../ids'
import { plan } from '../plan'
import { createWorkspace, sessionFor, system } from './harness'

describe('change log', () => {
  it('stores a draft as a card and reads it back', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await plan(session, [{ op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' }])
    const saved = await saveDraft(session, draft)
    expect(saved).toMatchObject({
      summary: draft.summary,
      status: 'draft',
      risk: 'safe',
      ops: draft.ops,
      inverse: draft.inverse,
      diff: draft.diff,
      typeKeys: ['nghi-phep'],
      author: session.account.primarySocialId,
      modelVersion: draft.modelVersion
    })
    expect(saved.approver).toBeUndefined()
    expect(saved.undoOf).toBeUndefined()
    expect(await getChange(session, saved.id)).toEqual(saved)
    const [stored] = await ws.client.findAll(card.class.Card, { _id: saved.id })
    expect(stored).toMatchObject({ _class: CHANGE_TYPE, space: CHANGE_SPACE, title: draft.summary })
  })

  it('keeps the draft fresh after ensuring the change log on first use', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    const draft = await plan(session, [{ op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' }])
    await saveDraft(session, draft)
    expect((await describeConfig(session)).version).toBe(draft.modelVersion)
    expect((await describeConfig(session)).types.some((it) => it.key === CHANGE_TYPE)).toBe(false)
  })

  it('creates the change log once', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    for (const key of ['a', 'b']) {
      await saveDraft(session, await plan(session, [{ op: 'createType', key, name: key.toUpperCase() }]))
    }
    expect(await ws.client.findAll(card.class.MasterTag, { _id: CHANGE_TYPE })).toHaveLength(1)
    expect(await ws.client.findAll(card.class.CardSpace, { _id: CHANGE_SPACE })).toHaveLength(1)
  })

  it('makes everyone who uses the change log a member of its space', async () => {
    const ws = createWorkspace()
    const author = sessionFor(ws, 'author')
    const saved = await saveDraft(author, await plan(author, [{ op: 'createType', key: 'a', name: 'A' }]))
    const reader = sessionFor(ws, 'reader')
    await listChanges(reader)
    const approver = sessionFor(ws, 'approver')
    await getChange(approver, saved.id)
    const [space] = await ws.client.findAll(card.class.CardSpace, { _id: CHANGE_SPACE })
    expect(space.members).toEqual([author.account.uuid, reader.account.uuid, approver.account.uuid])
  })

  it('keeps the change-log type locked after something marks it editable', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    await saveDraft(session, await plan(session, [{ op: 'createType', key: 'a', name: 'A' }]))
    // Stands in for OnMasterTagCreate, which marks every new type Editable=true after the create.
    await ws.client.tx(
      system.createTxMixin(CHANGE_TYPE, card.class.MasterTag, core.space.Model, setting.mixin.Editable, { value: true })
    )
    await saveDraft(session, await plan(session, [{ op: 'createType', key: 'b', name: 'B' }]))
    const [type] = await ws.client.findAll(card.class.MasterTag, { _id: CHANGE_TYPE })
    expect(Reflect.get(type, setting.mixin.Editable)).toMatchObject({ value: false })
  })

  it('refuses drafts that still have issues', async () => {
    const ws = createWorkspace()
    const user = sessionFor(ws, 'lan', AccountRole.User)
    const draft = await plan(user, [{ op: 'createType', key: 'nghi-phep', name: 'Đề nghị nghỉ phép' }])
    await expect(saveDraft(user, draft)).rejects.toMatchObject({ code: 'invalid' })
  })

  it('lists changes by status and type', async () => {
    const ws = createWorkspace()
    const session = sessionFor(ws)
    expect(await listChanges(session)).toEqual([])
    await saveDraft(session, await plan(session, [{ op: 'createType', key: 'a', name: 'A' }]))
    await saveDraft(session, await plan(session, [{ op: 'createType', key: 'b', name: 'B' }]))
    expect(await listChanges(session)).toHaveLength(2)
    expect((await listChanges(session, { type: 'a' })).map((it) => it.typeKeys)).toEqual([['a']])
    expect(await listChanges(session, { status: 'applied' })).toEqual([])
    expect(await listChanges(session, { limit: 1 })).toHaveLength(1)
  })

  it('parses change ids and reports unknown ones', async () => {
    const session = sessionFor(createWorkspace())
    expect(parseChangeId('  abc ')).toBe('abc')
    expect(() => parseChangeId(' ')).toThrow(expect.objectContaining({ code: 'invalid' }))
    await saveDraft(session, await plan(session, [{ op: 'createType', key: 'a', name: 'A' }]))
    await expect(getChange(session, parseChangeId('khong-co'))).rejects.toMatchObject({ code: 'not-found' })
  })
})
