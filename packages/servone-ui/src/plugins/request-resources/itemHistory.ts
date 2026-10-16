import core, { type Doc, type Ref, SortingOrder, type Status } from '@hcengineering/core'
import { createQuery } from '@hcengineering/presentation'
import request, { type Request } from '@hcengineering/request'
import { readable, type Readable } from 'svelte/store'
import { type ItemHistory, statusMoves } from '../tracker-resources/workflows/stages'

type GateRequestDoc = Request & { servoneGate?: Ref<Status> }

export interface RequestHistory extends ItemHistory {
  requests: GateRequestDoc[]
}

export function itemHistory (item: Ref<Doc>): Readable<RequestHistory | undefined> {
  return readable<RequestHistory | undefined>(undefined, (set) => {
    let moves: ItemHistory['moves'] | undefined
    let requests: GateRequestDoc[] | undefined
    const publish = (): void => {
      if (moves !== undefined && requests !== undefined) set({ moves, requests })
    }
    const txQuery = createQuery(true)
    txQuery.query(
      core.class.Tx,
      { objectId: item },
      (txes) => {
        moves = statusMoves(txes)
        publish()
      },
      { sort: { modifiedOn: SortingOrder.Ascending } }
    )
    const requestQuery = createQuery(true)
    requestQuery.query(
      request.class.Request,
      { attachedTo: item },
      (found) => {
        requests = found
        publish()
      },
      { sort: { createdOn: SortingOrder.Ascending } }
    )
    return () => {
      txQuery.unsubscribe()
      requestQuery.unsubscribe()
    }
  })
}
