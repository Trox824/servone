<script lang="ts">
  import type { Ref, Status } from '@hcengineering/core'
  import { Label } from '@hcengineering/ui'
  import type { ProjectStatusRow } from '@servone/config'
  import { Button } from '../../../lib/components/ui/button'
  import * as Dialog from '../../../lib/components/ui/dialog'
  import * as Select from '../../../lib/components/ui/select'
  import { str } from '../sprints/plugin'

  export let row: ProjectStatusRow
  export let targets: ProjectStatusRow[]
  export let initial: Ref<Status>
  export let onDelete: (moveTo: Ref<Status>) => void
  export let onClose: () => void
  export let isWorkflow: boolean

  let moveTo = initial
  $: target = targets.find((it) => it.status === moveTo)
</script>

<Dialog.Root open onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
  <Dialog.Content class="sm:max-w-md" data-id="delete-status">
    <Dialog.Header>
      <Dialog.Title><Label label={str.DeleteStatusTitle} params={{ name: row.name }} /></Dialog.Title>
      <Dialog.Description>
        {#if isWorkflow}
          <Label label={row.issueCount === 0 ? str.WorkflowDeleteStatusEmpty : str.WorkflowDeleteStatusMove} params={{ count: row.issueCount }} />
        {:else}
          <Label label={row.issueCount === 0 ? str.DeleteStatusEmpty : str.DeleteStatusMove} params={{ count: row.issueCount }} />
        {/if}
      </Dialog.Description>
    </Dialog.Header>
    {#if row.issueCount > 0}
      <Select.Root type="single" value={moveTo} onValueChange={(picked) => { moveTo = targets.find((it) => it.status === picked)?.status ?? moveTo }}>
        <Select.Trigger class="w-full">{target?.name ?? ''}</Select.Trigger>
        <Select.Content>
          {#each targets as it (it.status)}
            <Select.Item value={it.status} label={it.name} />
          {/each}
        </Select.Content>
      </Select.Root>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={onClose}><Label label={str.Cancel} /></Button>
      <Button variant="destructive" onclick={() => { onDelete(moveTo) }}><Label label={str.DeleteStatus} /></Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
