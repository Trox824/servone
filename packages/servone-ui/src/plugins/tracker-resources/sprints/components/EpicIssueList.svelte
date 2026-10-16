<script lang="ts">
  import type { Issue } from '@hcengineering/tracker'
  import type { EstimateScale } from '../lib/types'
  import { byRank } from '../ui'
  import IssueRow from './IssueRow.svelte'

  export let epic: Issue
  /** Every issue of the project; the epic's tree is picked out of it. */
  export let issues: Issue[]
  export let epics: Issue[] = []
  /** Status ids in workflow order. */
  export let statusOrder: string[] = []
  export let scale: EstimateScale

  interface Row { issue: Issue, depth: number }
  $: rows = treeOf(epic, issues, statusOrder)

  function treeOf (root: Issue, list: Issue[], order: string[]): Row[] {
    const kids = new Map<string, Issue[]>()
    for (const it of list) {
      const arr = kids.get(it.attachedTo as string) ?? []
      arr.push(it)
      kids.set(it.attachedTo as string, arr)
    }
    const at = (it: Issue): number => {
      const i = order.indexOf(it.status as string)
      return i === -1 ? order.length : i
    }
    const out: Row[] = []
    const walk = (parent: string, depth: number): void => {
      const children = [...(kids.get(parent) ?? [])].sort((a, b) => (depth === 0 ? at(a) - at(b) : 0) || byRank(a, b))
      for (const c of children) {
        out.push({ issue: c, depth })
        if (depth < 4) walk(c._id, depth + 1)
      }
    }
    walk(root._id, 0)
    return out
  }
</script>

{#each rows as row (row.issue._id)}
  <IssueRow issue={row.issue} {epic} {epics} {scale} depth={row.depth} showEpic={false} />
{/each}
