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

  function saveDeadline (deadline: number | null | undefined): void {
    if (deadline === undefined || deadline === value.deadline) return
    void client.updateCollection(
      value._class,
      value.space,
      value._id,
      value.attachedTo,
      value.attachedToClass,
      value.collection,
      { deadline }
    )
  }
</script>

{#if value}
  <DatePresenter
    value={value.deadline ?? null}
    kind={'link'}
    size={'medium'}
    labelNull={tracker.string.Deadline}
    {width}
    {editable}
    shouldIgnoreOverdue
    on:change={(event) => saveDeadline(event.detail)}
  />
{/if}
