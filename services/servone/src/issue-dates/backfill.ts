import type { RestClient } from '@hcengineering/api-client'
import type { DocumentQuery, MeasureContext, Ref, Status } from '@hcengineering/core'
import type { Issue } from '@hcengineering/tracker'
import { datesUpdate, type DatedIssue, type StatusKind } from './dates'
import { datedIssueClass, loadSettledDates, storedDates, writeDates, type StatusKinds } from './store'

// Each batch reads every tx of its issues in one query.
const BACKFILL_BATCH = 200

interface PassCounts {
  written: number
  estimated: number
}

// Selects only what must end up dated: done work may never have started, so "done without a start" would
// select the same issues on every run.
export async function backfillIssueDates (ctx: MeasureContext, client: RestClient, kinds: StatusKinds): Promise<void> {
  const statusesOf = (kind: StatusKind): Array<Ref<Status>> =>
    [...kinds].filter(([, statusKind]) => statusKind === kind).map(([status]) => status)
  const completed = await backfillPass(ctx, client, kinds, {
    status: { $in: statusesOf('done') },
    servoneCompletedOn: { $exists: false }
  })
  const started = await backfillPass(ctx, client, kinds, {
    status: { $in: statusesOf('active') },
    servoneStartedOn: { $exists: false }
  })
  ctx.info('issue-dates: backfill done', {
    completed: completed.written,
    started: started.written,
    estimated: completed.estimated + started.estimated
  })
}

async function backfillPass (
  ctx: MeasureContext,
  client: RestClient,
  kinds: StatusKinds,
  query: DocumentQuery<DatedIssue>
): Promise<PassCounts> {
  const counts: PassCounts = { written: 0, estimated: 0 }
  const seen = new Set<Ref<Issue>>()
  while (true) {
    const batch = await client.findAll(datedIssueClass, query, { limit: BACKFILL_BATCH })
    if (batch.length === 0) return counts
    if (batch.every((issue) => seen.has(issue._id))) {
      throw new Error(`issue-dates: backfill wrote no dates for ${batch.length} issues`)
    }
    for (const { issue, settled } of await loadSettledDates(client, kinds, batch)) {
      seen.add(issue._id)
      const update = datesUpdate(storedDates(issue), settled.dates)
      if (update === undefined) continue
      if (settled.isEstimated) {
        counts.estimated++
        ctx.warn('issue-dates: estimated', { issue: issue._id, identifier: issue.identifier })
      }
      await writeDates(client, issue, update)
      counts.written++
    }
  }
}
