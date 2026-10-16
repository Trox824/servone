<script lang="ts">
  import type { WithLookup } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import type { Issue } from '@hcengineering/tracker'
  import { DatePresenter } from '@hcengineering/ui'
  import tracker from '../../plugin'

  export let value: WithLookup<Issue>
  export let width: string | undefined = undefined
  export let editable: boolean = true

  const client = getClient()

  function applyStartDate (event: CustomEvent<number | null | undefined>): void {
    const nextStartDate = event.detail
    if (nextStartDate === undefined || nextStartDate === value.startDate) return
    void client.updateCollection(
      value._class,
      value.space,
      value._id,
      value.attachedTo,
      value.attachedToClass,
      value.collection,
      { startDate: nextStartDate }
    )
  }
</script>

{#if value}
  <DatePresenter
    value={value.startDate}
    kind={'link'}
    size={'medium'}
    labelNull={tracker.string.IssueStartDate}
    {width}
    {editable}
    shouldIgnoreOverdue
    on:change={applyStartDate}
  />
{/if}
