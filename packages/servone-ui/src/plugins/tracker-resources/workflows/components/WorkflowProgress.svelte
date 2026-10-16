<!-- The stage bar with the next move at its right end: move on, fill what blocks it, or decide the pending approval. -->
<script lang="ts">
  import { getName } from '@hcengineering/contact'
  import { getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import type { DocumentUpdate } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import type { ProjectType } from '@hcengineering/task'
  import type { Issue } from '@hcengineering/tracker'
  import { Button, eventToHTMLElement, IconArrowRight, Label, tooltip } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { statusStore } from '@hcengineering/view-resources'
  import { statusApproval } from '@servone/approvals/src/gate'
  import RequestActions from '../../../request-resources/components/RequestActions.svelte'
  import { pickNext } from '../pickNext'
  import type { RequestHistory } from '../../../request-resources/itemHistory'
  import { str as approvalStr } from '../../../request-resources/strings'
  import { str } from '../plugin'
  import { ACTIVE_REQUEST, nextStage, stageTrack, type StageInput } from '../stages'
  import StageStepper from './StageStepper.svelte'

  export let issue: Issue
  export let projectType: ProjectType
  export let history: RequestHistory
  export let readonly: boolean
  export let missing: string[]

  const client = getClient()
  const dispatch = createEventDispatcher<{ fill: undefined }>()
  const hierarchy = client.getHierarchy()

  let isMoving = false

  $: inputs = projectType.statuses.flatMap((entry): StageInput[] => {
    const found = $statusStore.byId.get(entry._id)
    return found === undefined ? [] : [{ ...found, approval: statusApproval(projectType, found._id) }]
  })
  $: track = stageTrack(inputs, issue.status, history)
  $: current = track.lost === undefined ? track.stages.find((stage) => stage.state === 'current') : undefined
  $: next = nextStage(track)
  $: waiting = current?.gate?.kind === 'waiting'
  $: active = history.requests.find((request) => request.status === ACTIVE_REQUEST && request.servoneGate === current?.status)
  $: approverStore = getPersonByPersonRefStore(active?.requested ?? [])
  $: approver = active === undefined ? undefined : $approverStore.get(active.requested[0])

  function move (anchor: HTMLElement): void {
    if (next === undefined) return
    const update: DocumentUpdate<Issue> = { status: next.status }
    if (next.approval?.by !== 'field') {
      void save(update)
      return
    }
    const { attribute } = next.approval
    pickNext(anchor, Reflect.get(issue, attribute), (person) => {
      void save(Object.assign(update, { [attribute]: person }))
    })
  }

  async function save (update: DocumentUpdate<Issue>): Promise<void> {
    isMoving = true
    try {
      await client.update(issue, update)
    } finally {
      isMoving = false
    }
  }
</script>

<div class="progress">
  <div class="progress__track"><StageStepper {track} /></div>
  {#if current !== undefined && (waiting || (next !== undefined && !readonly))}
    <div class="progress__action" data-id="next-step">
      {#if waiting}
        <span class="progress__muted">
          {#if approver !== undefined}
            <Label label={str.WaitingFor} params={{ name: getName(hierarchy, approver) }} />
          {:else}
            <Label label={approvalStr.Waiting} />
          {/if}
        </span>
        {#if active !== undefined}
          <RequestActions value={active} />
        {/if}
      {:else if next !== undefined}
        {#if missing.length > 0}
          <button class="progress__missing" data-id="btnRequiredLeft" on:click={() => dispatch('fill')}>
            <Label label={str.RequiredLeft} params={{ count: missing.length }} />
          </button>
          <!-- On a wrapper because a disabled button gets no pointer events. -->
          <span use:tooltip={{ label: str.FillIn, props: { fields: missing.join(', ') } }}>
            <Button
              label={str.MoveTo}
              labelParams={{ status: next.name }}
              size={'small'}
              iconRight={IconArrowRight}
              disabled
            />
          </span>
        {:else}
          <Button
            label={str.MoveTo}
            labelParams={{ status: next.name }}
            kind={'primary'}
            size={'small'}
            iconRight={IconArrowRight}
            loading={isMoving}
            disabled={isMoving}
            on:click={(event) => {
              move(eventToHTMLElement(event))
            }}
          />
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .progress {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem 1rem;
    margin-top: 0.75rem;
  }

  .progress__track {
    flex: 1 1 auto;
    min-width: 0;
  }

  .progress__action {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-left: auto;
    font-size: 0.8125rem;
  }

  .progress__muted {
    color: var(--muted-foreground);
  }

  .progress__missing {
    padding: 0;
    border: none;
    background: none;
    color: var(--muted-foreground);
    font: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--muted-foreground) 40%, transparent);
    text-underline-offset: 0.2em;
    cursor: pointer;
  }
  .progress__missing:hover {
    color: var(--foreground);
  }
  .progress__missing:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: 0.25rem;
  }
</style>
