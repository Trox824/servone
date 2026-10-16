import core, {
  type Class,
  type Doc,
  type DocumentQuery,
  type Ref,
  toFindResult,
  type Tx,
  type TxApplyIf,
  type TxCreateDoc,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import type { Json } from '../../http-json'
import type { SetupClient } from '../setup'

export interface MemoryWorkspace {
  client: SetupClient
  rows: (cls: Ref<Class<Doc>>) => Doc[]
  seed: (cls: Ref<Class<Doc>>, id: string, fields: Record<string, Json>) => void
  sent: Tx[]
}

// Stands in for the transactor: applies creates and plain updates, unpacks TxApplyIf, ignores mixins.
export function memoryWorkspace (): MemoryWorkspace {
  const tables = new Map<Ref<Class<Doc>>, Doc[]>()
  const rows = (cls: Ref<Class<Doc>>): Doc[] => {
    const table = tables.get(cls) ?? []
    tables.set(cls, table)
    return table
  }
  const seed = (cls: Ref<Class<Doc>>, id: string, fields: Record<string, Json>): void => {
    rows(cls).push({ space: core.space.Workspace, modifiedOn: 0, modifiedBy: core.account.System, ...fields, _id: id as Ref<Doc>, _class: cls })
  }

  const sent: Tx[] = []
  const matches = (row: Doc, query: DocumentQuery<Doc>): boolean =>
    Object.entries(query).every(([key, cond]) => {
      const field = Reflect.get(row, key)
      if (cond !== null && typeof cond === 'object' && '$in' in cond) return cond.$in.includes(field)
      return field === cond
    })
  const find = <T extends Doc>(cls: Ref<Class<T>>, query: DocumentQuery<T>): T[] =>
    rows(cls).filter((row) => matches(row, query)) as T[]
  const apply = (tx: Tx): void => {
    if (tx._class === core.class.TxApplyIf) {
      for (const inner of (tx as TxApplyIf).txes) apply(inner)
      return
    }
    sent.push(tx)
    if (tx._class === core.class.TxCreateDoc) {
      const create = tx as TxCreateDoc<Doc>
      rows(create.objectClass).push({ ...create.attributes, _id: create.objectId, _class: create.objectClass, space: create.objectSpace, modifiedOn: 0, modifiedBy: create.modifiedBy })
    }
    if (tx._class === core.class.TxRemoveDoc) {
      const remove = tx as TxRemoveDoc<Doc>
      const table = rows(remove.objectClass)
      table.splice(table.findIndex((it) => it._id === remove.objectId), 1)
    }
    if (tx._class === core.class.TxUpdateDoc) {
      const update = tx as TxUpdateDoc<Doc>
      const row = rows(update.objectClass).find((it) => it._id === update.objectId)
      if (row === undefined) throw new Error(`update of missing ${update.objectId}`)
      Object.assign(row, update.operations)
    }
  }
  const client: SetupClient = {
    findAll: async (cls, query) => toFindResult(find(cls, query)),
    findOne: async (cls, query) => find(cls, query)[0],
    tx: async (tx) => {
      apply(tx)
      return {}
    }
  }
  return { client, rows, seed, sent }
}
