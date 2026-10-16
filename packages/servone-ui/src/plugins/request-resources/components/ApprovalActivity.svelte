<script lang="ts">
  import type { DocUpdateMessage } from '@hcengineering/activity'
  import { PersonPresenter } from '@hcengineering/contact-resources'
  import type { Request } from '@hcengineering/request'
  import { Label } from '@hcengineering/ui'
  import { activityLine } from '../approvals'

  export let message: DocUpdateMessage
  export let value: Request & { servoneReason?: string }

  $: line = activityLine(message, value)
</script>

{#if line !== undefined}
  <span class="approval-line">
    <span class="approval-text"><Label label={line.label} />{#if line.reason !== undefined}: {line.reason}{/if}</span>
    {#if line.approver !== undefined}<PersonPresenter value={line.approver} />{/if}
  </span>
{/if}

<style lang="scss">
  .approval-line {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }

  .approval-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
