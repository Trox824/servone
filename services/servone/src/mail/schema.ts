// Mail card types are created at runtime: Railway runs the stock transactor, so a model package never reaches the DB.
import card, { type CardSpace, type MasterTag } from '@hcengineering/card'
import core, {
  type AccountUuid,
  type AnyAttribute,
  type Class,
  ClassifierKind,
  type Data,
  type Doc,
  type DocumentClassQuery,
  type Ref,
  type TxCUD,
  TxFactory,
  type TxOperations
} from '@hcengineering/core'
import { type Asset, getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
import setting, { type Editable } from '@hcengineering/setting'
import workbench, { type Application } from '@hcengineering/workbench'
import {
  cardBase,
  MAIL_APP_ALIAS,
  MAIL_APP_COMPONENT,
  MAIL_APP_ICON,
  MAIL_APP_ID,
  MAIL_APP_LABEL,
  MAIL_APPLY_SCOPE,
  MAIL_ATTRIBUTES,
  MAIL_TYPE_NAMES,
  MAIL_TYPES,
  mailboxSpaceId
} from '@servone/mail'

// __tests__/fake-cards.ts imports cardBase from here.
export { cardBase }

export function mailSchemaTxes (factory: TxFactory): Array<TxCUD<Doc>> {
  const txes: Array<TxCUD<Doc>> = []
  for (const type of MAIL_TYPES) {
    const tag: Data<MasterTag> = {
      extends: card.class.Card,
      label: getEmbeddedLabel(MAIL_TYPE_NAMES.get(type) ?? type),
      kind: ClassifierKind.CLASS,
      icon: card.icon.MasterTag
    }
    txes.push(factory.createTxCreateDoc(card.class.MasterTag, core.space.Model, tag, type))
  }
  for (const field of MAIL_ATTRIBUTES) {
    const attribute: Data<AnyAttribute> = {
      attributeOf: field.owner,
      name: field.name,
      label: getEmbeddedLabel(field.label),
      type: field.type,
      hidden: true
    }
    txes.push(factory.createTxCreateDoc(core.class.Attribute, core.space.Model, attribute))
  }
  return txes
}

// A separate tx after the create: OnMasterTagCreate sets Editable=true on every new type (see change-log.ts).
export function lockTxes (factory: TxFactory): Array<TxCUD<Doc>> {
  return MAIL_TYPES.map((type) =>
    factory.createTxMixin<Class<Doc>, Editable>(type, card.class.MasterTag, core.space.Model, setting.mixin.Editable, { value: false })
  )
}

export function mailboxTx (factory: TxFactory, owner: AccountUuid, email: string): TxCUD<Doc> {
  const space: Data<CardSpace> = {
    name: email,
    description: '',
    private: true,
    members: [owner],
    archived: false,
    type: card.spaceType.SpaceType,
    types: MAIL_TYPES
  }
  return factory.createTxCreateDoc(card.class.CardSpace, core.space.Space, space, mailboxSpaceId(owner))
}

const systemFactory = new TxFactory(core.account.System)

export async function ensureMailSchema (client: TxOperations): Promise<void> {
  const existing = await client.findAll(card.class.MasterTag, { _id: { $in: MAIL_TYPES } })
  if (existing.length === MAIL_TYPES.length) return
  const guard: DocumentClassQuery<Doc> = { _class: card.class.MasterTag, query: { _id: MAIL_TYPES[0] } }
  // A concurrent first connect makes notMatch fail; the types then exist, which is all this needs.
  await client.tx(systemFactory.createTxApplyIf(core.space.Tx, MAIL_APPLY_SCOPE, [], [guard], mailSchemaTxes(systemFactory), undefined))
  for (const tx of lockTxes(systemFactory)) await client.tx(tx)
}

export async function ensureMailbox (client: TxOperations, owner: AccountUuid, email: string): Promise<Ref<CardSpace>> {
  const id = mailboxSpaceId(owner)
  const existing = await client.findOne(card.class.CardSpace, { _id: id })
  if (existing !== undefined) return id
  const guard: DocumentClassQuery<Doc> = { _class: card.class.CardSpace, query: { _id: id } }
  await client.tx(systemFactory.createTxApplyIf(core.space.Tx, MAIL_APPLY_SCOPE, [], [guard], [mailboxTx(systemFactory, owner, email)], undefined))
  return id
}

export function mailAppTx (factory: TxFactory): TxCUD<Doc> {
  return factory.createTxCreateDoc(workbench.class.Application, core.space.Model, {
    label: MAIL_APP_LABEL as IntlString,
    icon: MAIL_APP_ICON as Asset,
    alias: MAIL_APP_ALIAS,
    hidden: false,
    position: 'top',
    component: MAIL_APP_COMPONENT as Data<Application>['component']
  }, MAIL_APP_ID as Ref<Application>)
}

// The stock transactor never loads a model package, so the sidebar entry is written as data, once per workspace.
export async function ensureMailApp (client: Pick<TxOperations, 'findOne' | 'tx'>): Promise<void> {
  const existing = await client.findOne(workbench.class.Application, { _id: MAIL_APP_ID as Ref<Application> })
  if (existing !== undefined) return
  const guard: DocumentClassQuery<Doc> = { _class: workbench.class.Application, query: { _id: MAIL_APP_ID } }
  await client.tx(systemFactory.createTxApplyIf(core.space.Tx, MAIL_APPLY_SCOPE, [], [guard], [mailAppTx(systemFactory)], undefined))
}
