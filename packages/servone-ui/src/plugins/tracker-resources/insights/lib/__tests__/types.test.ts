import { parseInsightsQuery } from '../types'

describe('parseInsightsQuery', () => {
  it('reads a stored query back', () => {
    const query = { measure: 'points', slice: 'assignee', segment: 'label', range: { preset: 'thisMonth' } }
    expect(parseInsightsQuery(JSON.stringify(query))).toEqual(query)
    const custom = { measure: 'count', slice: 'epic', segment: null, range: { preset: 'custom', from: 1, to: 2 } }
    expect(parseInsightsQuery(JSON.stringify(custom))).toEqual(custom)
  })

  it('drops the segment of a time measure and one equal to the slice', () => {
    expect(
      parseInsightsQuery(JSON.stringify({ measure: 'cycleTime', slice: 'assignee', segment: 'label', range: { preset: 'thisWeek' } }))?.segment
    ).toBeNull()
    expect(
      parseInsightsQuery(JSON.stringify({ measure: 'count', slice: 'label', segment: 'label', range: { preset: 'thisWeek' } }))?.segment
    ).toBeNull()
  })

  it('rejects anything invalid', () => {
    expect(parseInsightsQuery(null)).toBeUndefined()
    expect(parseInsightsQuery('{')).toBeUndefined()
    expect(parseInsightsQuery('"points"')).toBeUndefined()
    expect(parseInsightsQuery(JSON.stringify({ measure: 'hours', slice: 'assignee', segment: null, range: { preset: 'thisWeek' } }))).toBeUndefined()
    expect(
      parseInsightsQuery(JSON.stringify({ measure: 'count', slice: 'assignee', segment: null, range: { preset: 'custom', from: 5, to: 2 } }))
    ).toBeUndefined()
  })
})
