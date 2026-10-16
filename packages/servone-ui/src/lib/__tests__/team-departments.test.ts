import type { Doc, Ref } from '@hcengineering/core'
import { withoutBots } from '../team-departments'

jest.mock('@hcengineering/presentation', () => ({ createQuery: jest.fn() }))

const person = (id: string): { _id: Ref<Doc> } => ({ _id: id as Ref<Doc> })

describe('withoutBots', () => {
  it('drops the service bots and keeps everyone else in order', () => {
    const bots = new Set(['webhooks', 'forms'] as Array<Ref<Doc>>)
    const kept = withoutBots([person('an'), person('webhooks'), person('rbac'), person('forms')], bots)
    expect(kept.map((doc) => doc._id)).toEqual(['an', 'rbac'])
  })

  it('keeps everyone while the bot lookup has not answered', () => {
    expect(withoutBots([person('an')], new Set())).toHaveLength(1)
  })
})
