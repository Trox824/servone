import { type Class, type Doc, Hierarchy, type Ref } from '@hcengineering/core'
import tracker from '@hcengineering/tracker'

import { ToolInputError } from '../tool'
import { searchTools } from '../tools/search'
import { fakeSession } from './fixtures'

const search = searchTools.find((t) => t.name === 'search_workspace')
if (search === undefined) throw new Error('search_workspace missing')

const issueId = 'issue-1' as Ref<Doc>

function withHierarchy (known: Map<Ref<Class<Doc>>, Array<Ref<Class<Doc>>>>): ReturnType<typeof fakeSession> {
  const session = fakeSession()
  const hierarchy = new Hierarchy()
  jest.spyOn(hierarchy, 'hasClass').mockImplementation((_class) => known.has(_class))
  jest.spyOn(hierarchy, 'getDescendants').mockImplementation((_class) => known.get(_class) ?? [])
  jest.mocked(session.client.getHierarchy).mockReturnValue(hierarchy)
  jest.mocked(session.rest.searchFulltext).mockResolvedValue({
    docs: [
      {
        id: issueId,
        title: 'Fix login',
        shortTitle: 'SRV-12',
        doc: { _id: issueId, _class: tracker.class.Issue, createdOn: 0 }
      }
    ],
    total: 40
  })
  return session
}

describe('search_workspace', () => {
  it('appends a prefix wildcard and forwards the limit', async () => {
    const session = withHierarchy(new Map())
    const out = await search.run(session, { query: 'login', limit: 5 })
    expect(session.rest.searchFulltext).toHaveBeenCalledWith({ query: 'login*' }, { limit: 5 })
    expect(out).toContain('SRV-12 Fix login  (tracker:class:Issue)  issue-1')
    expect(out).toContain('Showing 1 of 40')
  })

  it('maps kind to the class and its descendants', async () => {
    const sub = 'tracker:class:SubIssue' as Ref<Class<Doc>>
    const session = withHierarchy(new Map([[tracker.class.Issue, [tracker.class.Issue, sub]]]))
    await search.run(session, { query: 'login', kind: 'issue' })
    expect(session.rest.searchFulltext).toHaveBeenCalledWith(
      { query: 'login*', classes: [tracker.class.Issue, sub] },
      { limit: 10 }
    )
  })

  it('rejects a kind whose class is not in this workspace', async () => {
    const session = withHierarchy(new Map())
    await expect(search.run(session, { query: 'spec', kind: 'document' })).rejects.toThrow(ToolInputError)
    expect(session.rest.searchFulltext).not.toHaveBeenCalled()
  })

  it('rejects a one-character query', async () => {
    await expect(search.run(withHierarchy(new Map()), { query: 'a' })).rejects.toThrow()
  })
})
