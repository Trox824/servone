import task from '@hcengineering/task'
import { TEMPLATES } from '../templates'

describe('TEMPLATES', () => {
  it('starts every type in Not started, so new items never sit under an empty group', () => {
    const firstCategories = Object.values(TEMPLATES).flatMap((template) => template.types.map((type) => type.statuses[0].category))
    expect(new Set(firstCategories)).toEqual(new Set([task.statusCategory.UnStarted]))
  })
})
