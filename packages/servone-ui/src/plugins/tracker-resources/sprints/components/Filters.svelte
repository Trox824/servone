<!--
  The page's list stays whole (sections, totals and ranks need every issue); this only reports matching ids
  in `filter.match`, `undefined` while no filter is set.
-->
<script lang="ts">
  import type { DocumentQuery, Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import tracker, { type Issue, type Project } from '@hcengineering/tracker'
  import { FilterBar } from '@hcengineering/view-resources'
  import type { IssueFilter } from '../filters'

  export let space: Ref<Project>
  export let filter: IssueFilter

  let resultQuery: DocumentQuery<Issue> = {}
  $: baseQuery = { space } as DocumentQuery<Issue>
  $: narrowed = Object.keys(resultQuery).some((k) => k !== 'space')

  const matchQuery = createQuery()
  $: if (narrowed) {
    matchQuery.query(
      tracker.class.Issue,
      { ...resultQuery, space },
      (res) => {
        filter = { ...filter, match: new Set(res.map((it) => it._id as string)) }
      },
      { projection: { _id: 1 } }
    )
  } else {
    matchQuery.unsubscribe()
    if (filter.match !== undefined) filter = { ...filter, match: undefined }
  }
</script>

<FilterBar _class={tracker.class.Issue} {space} query={baseQuery} on:change={(e) => (resultQuery = e.detail)} />
