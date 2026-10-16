<script lang="ts">
  import { PersonRefPresenter } from '@hcengineering/contact-resources'
  import { Label } from '@hcengineering/ui'
  import * as Table from '../../../../lib/components/ui/table'
  import { str } from '../../sprints/plugin'
  import type { StatusTable } from '../lib/aggregate'
  import InsightsCell from './InsightsCell.svelte'

  export let table: StatusTable

  const STICKY = 'sticky left-0 z-10 bg-background'
</script>

<Table.Root class="text-xs">
  <Table.Header>
    <Table.Row>
      <Table.Head class={STICKY}><Label label={str.InsightsAssignee} /></Table.Head>
      {#each table.columns as column (column.name)}
        <Table.Head class="text-right">{column.name}</Table.Head>
      {/each}
      <Table.Head class="text-right"><Label label={str.InsightsTotal} /></Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#each table.rows as row (row.assignee)}
      <Table.Row>
        <Table.Cell class="{STICKY} max-w-40 truncate">
          {#if row.assignee === ''}
            <span class="text-muted-foreground"><Label label={str.InsightsUnassigned} /></span>
          {:else}
            <PersonRefPresenter value={row.assignee} />
          {/if}
        </Table.Cell>
        {#each row.cells as amount, index (table.columns[index].name)}
          <Table.Cell class="text-right"><InsightsCell {amount} /></Table.Cell>
        {/each}
        <Table.Cell class="text-right"><InsightsCell amount={row.total} isTotal /></Table.Cell>
      </Table.Row>
    {/each}
  </Table.Body>
  <Table.Footer>
    <Table.Row>
      <Table.Cell class={STICKY}><Label label={str.InsightsTotal} /></Table.Cell>
      {#each table.totals as amount, index (table.columns[index].name)}
        <Table.Cell class="text-right"><InsightsCell {amount} isTotal /></Table.Cell>
      {/each}
      <Table.Cell class="text-right"><InsightsCell amount={table.total} isTotal /></Table.Cell>
    </Table.Row>
  </Table.Footer>
</Table.Root>
