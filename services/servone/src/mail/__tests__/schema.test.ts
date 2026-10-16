import card from '@hcengineering/card'
import core, { type AccountUuid, TxFactory, type TxCreateDoc, type Doc, type TxCUD } from '@hcengineering/core'
import setting from '@hcengineering/setting'
import workbench from '@hcengineering/workbench'
import { MAIL_APP_ID, MAIL_ATTRIBUTES, MAIL_TYPES, mailboxSpaceId } from '@servone/mail'
import { ensureMailApp, lockTxes, mailAppTx, mailboxTx, mailSchemaTxes } from '../schema'

const factory = new TxFactory(core.account.System)

function creates (txes: Array<TxCUD<Doc>>): Array<TxCreateDoc<Doc>> {
  return txes.filter((tx): tx is TxCreateDoc<Doc> => tx._class === core.class.TxCreateDoc)
}

describe('mail schema', () => {
  it('creates the four types with fixed ids and every attribute', () => {
    const txes = creates(mailSchemaTxes(factory))
    expect(txes.filter((tx) => tx.objectClass === card.class.MasterTag).map((tx) => tx.objectId)).toEqual(MAIL_TYPES)
    expect(txes.filter((tx) => tx.objectClass === core.class.Attribute)).toHaveLength(MAIL_ATTRIBUTES.length)
  })

  it('locks every type against editing in settings', () => {
    const txes = lockTxes(factory)
    expect(txes).toHaveLength(4)
    for (const tx of txes) expect(tx.objectClass).toBe(card.class.MasterTag)
    expect(txes.every((tx) => Reflect.get(tx, 'mixin') === setting.mixin.Editable)).toBe(true)
  })

  it('makes the mailbox private to its owner', () => {
    const owner = 'owner-1' as AccountUuid
    const tx = mailboxTx(factory, owner, 'linh@example.vn')
    expect(tx.objectId).toBe(mailboxSpaceId(owner))
    expect(Reflect.get(tx, 'attributes')).toMatchObject({ private: true, members: [owner], types: MAIL_TYPES })
  })
})

describe('mail app', () => {
  it('creates one Application doc in the model space with the client-side resource ids', () => {
    const tx = mailAppTx(new TxFactory(core.account.System))
    expect(tx.objectClass).toBe(workbench.class.Application)
    expect(tx.objectSpace).toBe(core.space.Model)
    expect(tx.objectId).toBe(MAIL_APP_ID)
    expect(Reflect.get(tx, 'attributes')).toEqual({
      label: 'servone-mail:string:Mail',
      icon: 'servone-mail:icon:mail',
      alias: 'mail',
      hidden: false,
      position: 'top',
      component: 'servone-mail:component:MailApp'
    })
  })

  it('skips the write when the app already exists', async () => {
    const tx = jest.fn()
    const client = { findOne: async () => ({ _id: MAIL_APP_ID }), tx }
    await ensureMailApp(client)
    expect(tx).not.toHaveBeenCalled()
  })
})
