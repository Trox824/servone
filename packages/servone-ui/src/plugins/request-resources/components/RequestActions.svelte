<script lang="ts">
  import { getCurrentEmployee, type Person } from '@hcengineering/contact'
  import { getCurrentAccount, type Ref, type Status } from '@hcengineering/core'
  import type { Request } from '@hcengineering/request'
  import { Button, eventToHTMLElement, Label, showPopup } from '@hcengineering/ui'
  import { ServiceApiError } from '../../chunter-resources/webhooks/api'
  import { handoverAfter, pickNext } from '../../tracker-resources/workflows/pickNext'
  import { approvalButtons, decide, decisionErrorLabel } from '../approvals'
  import { str } from '../strings'
  import RejectDialog from './RejectDialog.svelte'

  export let value: Request & { servoneGate?: Ref<Status> }

  type Decision = 'approve' | 'reject' | 'withdraw'

  let pending: Decision | undefined
  let failure: ReturnType<typeof decisionErrorLabel> | undefined

  $: access = approvalButtons(value, getCurrentEmployee(), getCurrentAccount().socialIds)

  async function approve (anchor: HTMLElement): Promise<void> {
    const handover = value.servoneGate === undefined ? undefined : await handoverAfter(value.attachedTo, value.servoneGate)
    if (handover === undefined) {
      await send('approve')
      return
    }
    pickNext(anchor, handover.current, (person) => {
      void send('approve', person)
    })
  }

  async function send (decision: Decision, next?: Ref<Person>): Promise<void> {
    pending = decision
    failure = undefined
    try {
      await decide(value._id, decision, '', next)
    } catch (error) {
      failure = error instanceof ServiceApiError ? decisionErrorLabel(error.code) : str.ErrorUnknown
    } finally {
      pending = undefined
    }
  }

  function openReject (): void {
    showPopup(RejectDialog, { request: value._id })
  }
</script>

{#if access.canDecide || access.canWithdraw}
  <div class="actions">
    <div class="buttons">
      {#if access.canDecide}
        <Button
          kind="primary"
          label={str.Approve}
          loading={pending === 'approve'}
          disabled={pending !== undefined}
          on:click={(event) => {
            void approve(eventToHTMLElement(event))
          }}
        />
        <Button label={str.Reject} disabled={pending !== undefined} on:click={openReject} />
      {/if}
      {#if access.canWithdraw}
        <Button
          label={str.Withdraw}
          loading={pending === 'withdraw'}
          disabled={pending !== undefined}
          on:click={() => {
            void send('withdraw')
          }}
        />
      {/if}
    </div>
    {#if failure !== undefined}
      <div class="text-destructive mt-2"><Label label={failure} /></div>
    {/if}
  </div>
{/if}

<style>
  .buttons {
    display: flex;
    flex-direction: row;
    gap: 8px;
  }
</style>
