<script lang="ts">
  import { getName } from '@hcengineering/contact'
  import { getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import { type Doc, type Ref, type Status, SortingOrder } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import request, { type Request, RequestStatus } from '@hcengineering/request'
  import { Label } from '@hcengineering/ui'
  import { statusStore } from '@hcengineering/view-resources'
  import { str } from '../strings'
  import RequestActions from './RequestActions.svelte'
  import RequestView from './RequestView.svelte'

  export let object: Doc

  const hierarchy = getClient().getHierarchy()
  const query = createQuery()
  let latest: (Request & { servoneGate?: Ref<Status> }) | undefined

  $: query.query(
    request.class.Request,
    { attachedTo: object._id },
    (requests) => {
      latest = requests[0]
    },
    { sort: { createdOn: SortingOrder.Descending }, limit: 1 }
  )
  $: approverStore = getPersonByPersonRefStore(latest?.requested ?? [])
  $: approver = latest === undefined ? undefined : $approverStore.get(latest.requested[0])
  $: gate = latest?.servoneGate === undefined ? undefined : $statusStore.byId.get(latest.servoneGate)
</script>

{#if latest !== undefined}
  {#if latest.status === RequestStatus.Active}
    <div class="pending">
      <span class="pending__text">
        {#if gate !== undefined}<Label label={str.ApprovalTo} params={{ status: gate.name }} /> ·{/if}
        {#if approver !== undefined}
          <Label label={str.WaitingFor} params={{ name: getName(hierarchy, approver) }} />
        {:else}
          <Label label={str.Waiting} />
        {/if}
      </span>
      <RequestActions value={latest} />
    </div>
  {:else}
    <div class="block">
      <RequestView value={latest} showItem={false} />
    </div>
  {/if}
{/if}

<style>
  .pending {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem 0.75rem;
    margin-bottom: 1.5rem;
    font-size: 0.8125rem;
  }

  .pending__text {
    color: var(--muted-foreground);
  }

  .block {
    margin-bottom: 1.5rem;
  }
</style>
