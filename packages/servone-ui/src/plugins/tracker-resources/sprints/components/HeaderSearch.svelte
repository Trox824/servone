<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import tracker, { type Project } from '@hcengineering/tracker'
  import { SearchInput } from '@hcengineering/ui'
  import { FilterButton } from '@hcengineering/view-resources'
  import type { IssueFilter } from '../filters'

  export let space: Ref<Project>
  export let filter: IssueFilter
</script>

<SearchInput bind:value={filter.search} collapsed />
<FilterButton _class={tracker.class.Issue} {space} />
