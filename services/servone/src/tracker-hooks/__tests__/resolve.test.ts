import type { Person } from '@hcengineering/contact'
import type { PersonId, Ref, TxCUD } from '@hcengineering/core'
import { jsonToMarkup } from '@hcengineering/text-core'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import { type Issue, IssuePriority, type IssueStatus } from '@hcengineering/tracker'
import { type IssueChange, readIssueChange } from '../events'
import type { PersonRef } from '../payload'
import { resolveChange, type WorkspaceReader } from '../resolve'
import {
  ACTOR,
  addComment,
  AN,
  createIssue,
  IN_PROGRESS,
  PROJECT,
  removeIssue,
  TODO,
  updateIssue
} from './fixtures'

const ISSUE_URLS = 'https://app.servone.vn/workbench/servone/tracker'
const HUNG: PersonRef = { name: 'Hung Nguyen', email: 'hung@servone.vn' }
const AN_TRAN: PersonRef = { name: 'An Tran', email: null }

function reader (history: Array<TxCUD<Issue>>): WorkspaceReader {
  const statuses = new Map<Ref<IssueStatus>, string>([
    [TODO, 'Todo'],
    [IN_PROGRESS, 'In Progress']
  ])
  return {
    issueHistory: async (_issue, until) => history.filter((tx) => tx.modifiedOn <= until),
    statusNames: async (ids) => new Map(ids.flatMap((id) => (statuses.has(id) ? [[id, statuses.get(id) ?? '']] : []))),
    person: async (person: Ref<Person>) => (person === AN ? AN_TRAN : { name: 'Unknown', email: null }),
    actor: async (socialId: PersonId) => (socialId === ACTOR ? HUNG : { name: 'System', email: null }),
    account: async () => HUNG,
    project: async () => ({ identifier: 'SRV', name: 'Servone' })
  }
}

function changeOf (tx: Parameters<typeof readIssueChange>[0]): IssueChange {
  const change = readIssueChange(tx)
  if (change === undefined) throw new Error('not an issue change')
  return change
}

describe('resolveChange', () => {
  it('resolves a new issue with no changes listed', async () => {
    const create = createIssue({ assignee: AN })
    const outcome = await resolveChange(reader([create]), changeOf(create), ISSUE_URLS)
    expect(outcome).toEqual({
      resolved: {
        occurredAt: 1_000,
        project: { identifier: 'SRV', name: 'Servone' },
        issue: {
          identifier: 'SRV-122',
          title: 'Send tracker events',
          status: 'Todo',
          priority: IssuePriority.Medium,
          assignee: AN_TRAN,
          dueDate: null,
          url: `${ISSUE_URLS}/SRV-122`
        },
        previous: undefined,
        changedFields: [],
        actor: HUNG,
        comment: undefined
      }
    })
  })

  it('resolves a status change with the state before and after the tx', async () => {
    const create = createIssue()
    const move = updateIssue({ status: IN_PROGRESS })
    const later = updateIssue({ title: 'Renamed later' }, 9_000)
    const outcome = await resolveChange(reader([create, move, later]), changeOf(move), ISSUE_URLS)
    if (!('resolved' in outcome)) throw new Error(`skipped: ${outcome.skipped}`)
    expect(outcome.resolved.changedFields).toEqual(['status'])
    expect(outcome.resolved.previous?.status).toBe('Todo')
    expect(outcome.resolved.issue).toMatchObject({ status: 'In Progress', title: 'Send tracker events' })
    expect(outcome.resolved.occurredAt).toBe(2_000)
  })

  it('skips an update that rewrites a field with its current value', async () => {
    const create = createIssue()
    const rewrite = updateIssue({ status: TODO })
    expect(await resolveChange(reader([create, rewrite]), changeOf(rewrite), ISSUE_URLS)).toEqual({ skipped: 'unchanged' })
  })

  it('skips an update whose issue history cannot be rebuilt', async () => {
    const move = updateIssue({ status: IN_PROGRESS })
    expect(await resolveChange(reader([move]), changeOf(move), ISSUE_URLS)).toEqual({ skipped: 'no_history' })
  })

  it('resolves a deletion with the last state and no URL', async () => {
    const create = createIssue()
    const remove = removeIssue()
    const outcome = await resolveChange(reader([create, remove]), changeOf(remove), ISSUE_URLS)
    if (!('resolved' in outcome)) throw new Error(`skipped: ${outcome.skipped}`)
    expect(outcome.resolved.issue).toMatchObject({ identifier: 'SRV-122', title: 'Send tracker events', url: null })
    expect(outcome.resolved.changedFields).toEqual([])
  })

  it('resolves a comment as markdown with the issue at comment time', async () => {
    const create = createIssue()
    const comment = addComment(jsonToMarkup(markdownToMarkup('Deployed to staging, **please test**.')))
    const outcome = await resolveChange(reader([create]), changeOf(comment), ISSUE_URLS)
    if (!('resolved' in outcome)) throw new Error(`skipped: ${outcome.skipped}`)
    expect(outcome.resolved.comment).toBe('Deployed to staging, **please test**.')
    expect(outcome.resolved.changedFields).toEqual([])
    expect(outcome.resolved.issue.identifier).toBe('SRV-122')
  })

  it('leaves the issue URL empty when the workspace URL is unknown', async () => {
    const create = createIssue()
    const outcome = await resolveChange(reader([create]), changeOf(create), undefined)
    if (!('resolved' in outcome)) throw new Error(`skipped: ${outcome.skipped}`)
    expect(outcome.resolved.issue.url).toBeNull()
  })
})
