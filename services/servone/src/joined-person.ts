import contact, { type Employee, type Person } from '@hcengineering/contact'
import core, { type Ref, type Tx, type TxMixin } from '@hcengineering/core'

export function joinedPerson (tx: Tx): Ref<Person> | undefined {
  if (tx._class !== core.class.TxMixin) return undefined
  const mixin = tx as TxMixin<Person, Employee>
  return mixin.mixin === contact.mixin.Employee && mixin.attributes.active === true ? mixin.objectId : undefined
}
