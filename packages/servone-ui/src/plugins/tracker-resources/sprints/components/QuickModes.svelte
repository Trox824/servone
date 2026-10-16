<script lang="ts">
  import { Switcher, type TabItem } from '@hcengineering/ui'
  import type { IssueFilter, QuickMode } from '../filters'
  import { str } from '../plugin'

  export let filter: IssueFilter
  export let estimates = true

  $: items = [
    { id: 'all', labelIntl: str.All },
    { id: 'mine', labelIntl: str.OnlyMyIssues },
    ...(estimates ? [{ id: 'unpointed', labelIntl: str.OnlyUnpointed }] : []),
    { id: 'blocked', labelIntl: str.OnlyBlocked }
  ] as TabItem[]

  function select (item: TabItem): void {
    filter = { ...filter, mode: item.id as QuickMode }
  }
</script>

<div class="no-scrollbar min-w-0 overflow-x-auto">
  <Switcher
    name={'sprint-quick-mode'}
    {items}
    selected={filter.mode}
    kind={'subtle'}
    on:select={(e) => select(e.detail)}
  />
</div>
