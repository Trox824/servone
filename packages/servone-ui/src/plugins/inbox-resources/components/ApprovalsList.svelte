<!--
  Inbox "Waiting for my approval" list, shown by the InboxNavigation shadow while the InboxHeader
  switch is on it. Header runs the query so its count shows on either tab.
-->
<script lang="ts" module>
  import type { Person } from '@hcengineering/contact'
  import type { AttachedDoc, Class, Ref } from '@hcengineering/core'
  import { writable } from 'svelte/store'

  interface WaitingRequest extends AttachedDoc {
    requested: Array<Ref<Person>>
    status: string
  }
  export const REQUEST_CLASS = 'request:class:Request' as Ref<Class<WaitingRequest>>
  export const ACTIVE_STATUS = 'Active'

  export const isApprovalsTab = writable(false)
  export const waitingRequests = writable<WaitingRequest[]>([])
</script>

<script lang="ts">
  import type { Doc } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import { closePanel, getCurrentResolvedLocation, Label, navigate } from '@hcengineering/ui'
  import { encodeObjectURI } from '@hcengineering/view'
  import RequestView from '../../request-resources/components/RequestView.svelte'

  export let doc: Doc | undefined

  interface TitledIssue extends Doc {
    identifier: string
    title: string
  }
  const ISSUE_CLASS = 'tracker:class:Issue' as Ref<Class<TitledIssue>>

  const issueQuery = createQuery()
  let headings = new Map<string, string>()
  $: issueQuery.query(
    ISSUE_CLASS,
    { _id: { $in: $waitingRequests.map((request) => request.attachedTo as Ref<TitledIssue>) } },
    (issues) => {
      headings = new Map(issues.map((issue) => [issue._id, `${issue.identifier} ${issue.title}`]))
    }
  )

  const EMPTY = 'notification:string:ServoneApprovalsEmpty' as IntlString
  const EMPTY_HINT = 'notification:string:ServoneApprovalsEmptyHint' as IntlString

  function open (event: MouseEvent | KeyboardEvent, request: WaitingRequest): void {
    if (event.target instanceof Element && event.target !== event.currentTarget && event.target.closest('button, a') !== null) return
    closePanel()
    const loc = getCurrentResolvedLocation()
    loc.path[3] = encodeObjectURI(request.attachedTo, request.attachedToClass)
    loc.path.length = 4
    delete loc.fragment
    delete loc.query?.message
    navigate(loc)
  }
</script>

{#if $waitingRequests.length === 0}
  <div class="approvals-empty">
    <span class="approvals-empty__title"><Label label={EMPTY} /></span>
    <span class="approvals-empty__body"><Label label={EMPTY_HINT} /></span>
  </div>
{:else}
  <ul class="approvals">
    {#each $waitingRequests as request (request._id)}
      <!-- Not a <button>: RequestView holds the Approve / Reject buttons. -->
      <!-- svelte-ignore a11y-no-noninteractive-element-to-interactive-role -->
      <li
        class="approval"
        class:selected={request.attachedTo === doc?._id}
        role="button"
        tabindex="0"
        on:click={(event) => { open(event, request) }}
        on:keydown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          open(event, request)
        }}
      >
        <RequestView value={request} heading={headings.get(request.attachedTo)} />
      </li>
    {/each}
  </ul>
{/if}

<style lang="scss">
  .approvals {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0.5rem;
    list-style: none;
    overflow-y: auto;
  }

  .approval {
    border-radius: 0.5rem;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      outline: 1px solid var(--theme-button-border);
    }

    &.selected {
      outline: 1px solid var(--primary-button-default);
    }
  }

  .approvals-empty {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    height: inherit;
    width: 100%;
    padding: 0 1.5rem;
    text-align: center;

    &__title {
      font-weight: 600;
    }

    &__body {
      max-width: 20rem;
      color: var(--theme-halfcontent-color);
    }
  }
</style>
