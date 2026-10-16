import type { Person } from '@hcengineering/contact'
import type { Ref } from '@hcengineering/core'
import { createQuery } from '@hcengineering/presentation'
import request, { RequestStatus } from '@hcengineering/request'
import { readable } from 'svelte/store'
import { awaitingApprovers } from './approvals'

export const awaitingStore = readable(new Map<string, Ref<Person>>(), (set) => {
  const query = createQuery(true)
  query.query(
    request.class.Request,
    { status: RequestStatus.Active },
    (waiting) => {
      set(awaitingApprovers(waiting))
    },
    { projection: { _id: 1, attachedTo: 1, requested: 1, space: 1 } }
  )
  return () => {
    query.unsubscribe()
  }
})
