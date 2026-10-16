<script lang="ts">
  import { type Employee, getName } from '@hcengineering/contact'
  import { employeeByIdStore } from '@hcengineering/contact-resources'
  import type { Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { taskTypeStore } from '@hcengineering/task-resources'
  import type { Issue } from '@hcengineering/tracker'
  import { Label, tooltip } from '@hcengineering/ui'
  import { isWorkflowKind } from '../../components/issues/workflowItem'
  import { awaitingStore } from '../../../request-resources/awaiting'
  import { str } from '../plugin'

  export let issue: Issue

  const client = getClient()

  $: approver = isWorkflowKind(issue.kind, $taskTypeStore) ? $awaitingStore.get(issue._id) : undefined
  $: employee = approver === undefined ? undefined : $employeeByIdStore.get(approver as Ref<Employee>)
  $: hint =
    employee === undefined
      ? { label: str.AwaitingApproval }
      : { label: str.AwaitingApprovalFrom, props: { name: getName(client.getHierarchy(), employee) } }
</script>

{#if approver !== undefined}
  <span class="awaiting" data-awaiting-approval use:tooltip={hint}>
    <span class="awaiting__dot" />
    <Label label={str.AwaitingApproval} />
  </span>
{/if}

<style lang="scss">
  .awaiting {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.375rem;
    border-radius: 1rem;
    background: var(--theme-button-default);
    color: var(--theme-caption-color);
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .awaiting__dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--theme-state-regular-color);
  }
</style>
