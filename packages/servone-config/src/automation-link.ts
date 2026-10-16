import type { MasterTag } from '@hcengineering/card'
import type { Association, Class, Doc, Ref } from '@hcengineering/core'
import type { ModelState } from './state'

export interface LinkedEnd {
  type: MasterTag
  direction: 'A' | 'B'
}

export function isEnd (state: ModelState, end: Ref<Class<Doc>>, type: MasterTag): boolean {
  const base = state.types().find((it) => it._id === end)
  return base !== undefined && state.descendantsOf(base._id).includes(type._id)
}

// AddRelation stores the record the rule runs on as docA unless the direction is 'A'.
export function linkDirection (state: ModelState, link: Association, source: MasterTag, target: MasterTag): 'A' | 'B' | undefined {
  if (isEnd(state, link.classA, source) && isEnd(state, link.classB, target)) return 'B'
  if (isEnd(state, link.classB, source) && isEnd(state, link.classA, target)) return 'A'
  return undefined
}

// Stock getRelationValue reads classB cards for direction 'B' and classA cards for 'A' (server-plugins/process-resources/src/utils.ts:183-240).
export function linkedEnd (state: ModelState, link: Association, type: MasterTag): LinkedEnd | undefined {
  const typeOf = (end: Ref<Class<Doc>>): MasterTag | undefined => state.types().find((it) => it._id === end)
  if (isEnd(state, link.classA, type)) {
    const far = typeOf(link.classB)
    return far === undefined ? undefined : { type: far, direction: 'B' }
  }
  if (isEnd(state, link.classB, type)) {
    const far = typeOf(link.classA)
    return far === undefined ? undefined : { type: far, direction: 'A' }
  }
  return undefined
}
