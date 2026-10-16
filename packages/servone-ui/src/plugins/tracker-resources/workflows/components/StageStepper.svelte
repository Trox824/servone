<!-- Where a workflow item is in its process, from the statuses it actually entered. Display only. -->
<script lang="ts">
  import { getName, type Person } from '@hcengineering/contact'
  import { getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import type { Ref } from '@hcengineering/core'
  import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { Label, tooltip } from '@hcengineering/ui'
  import { Check, CircleX, ShieldAlert, ShieldCheck } from '@lucide/svelte'
  import { str as approvalStr } from '../../../request-resources/strings'
  import { str } from '../plugin'
  import type { Stage, StageTrack } from '../stages'

  export let track: StageTrack

  const hierarchy = getClient().getHierarchy()

  let scroller: HTMLOListElement | null = null
  let currentStep: HTMLLIElement | null = null

  $: approvers = getPersonByPersonRefStore(
    track.stages.flatMap((stage) =>
      (stage.gate?.kind === 'waiting' || stage.gate?.kind === 'approved') && stage.gate.approver !== undefined
        ? [stage.gate.approver]
        : []
    )
  )
  $: if (scroller !== null && currentStep !== null) {
    scroller.scrollLeft = currentStep.offsetLeft - (scroller.clientWidth - currentStep.offsetWidth) / 2
  }

  function gateHint (stage: Stage, people: Map<Ref<Person>, Readonly<Person>>): { label: IntlString, params: Record<string, string> } {
    const gate = stage.gate
    const approver = gate?.kind === 'waiting' || gate?.kind === 'approved' ? gate.approver : undefined
    const person = approver === undefined ? undefined : people.get(approver)
    const name = person === undefined ? undefined : getName(hierarchy, person)
    if (gate?.kind === 'missing') return { label: str.NotApproved, params: {} }
    if (gate?.kind === 'waiting') {
      return name === undefined ? { label: approvalStr.Waiting, params: {} } : { label: str.WaitingFor, params: { name } }
    }
    if (gate?.kind === 'approved') {
      if (name === undefined) return { label: approvalStr.Approved, params: {} }
      const date = new Date(gate.on).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      return { label: str.ApprovedByOn, params: { name, date } }
    }
    return { label: stage.approval?.by === 'manager' ? str.NeedsManagerApproval : str.NeedsApproval, params: {} }
  }
</script>

{#if track.stages.length > 0}
  <ol class="stepper" class:is-lost={track.lost !== undefined} bind:this={scroller} data-id="stage-stepper">
    {#each track.stages as stage (stage.status)}
      {@const hint = gateHint(stage, $approvers)}
      {#if stage.state === 'current'}
        <li class="step current" aria-current="step" bind:this={currentStep}>
          <span class="chip">
            <span class="name" use:tooltip={{ label: getEmbeddedLabel(stage.name) }}>{stage.name}</span>
            {#if stage.approval !== undefined}
              <span class="approval" use:tooltip={{ label: hint.label, props: hint.params }}>
                <ShieldCheck size={12} aria-hidden="true" />
                <span class="sr-only"><Label label={hint.label} params={hint.params} /></span>
              </span>
            {/if}
          </span>
        </li>
      {:else}
        <li class="step {stage.state}" class:is-unapproved={stage.gate?.kind === 'missing'}>
          <span class="chip">
            {#if stage.state === 'skipped'}
              <span class="node" use:tooltip={{ label: str.Skipped }}>
                <span class="sr-only"><Label label={str.Skipped} /></span>
              </span>
            {:else}
              <span class="node">
                {#if stage.state === 'done'}<Check size={10} strokeWidth={3} aria-hidden="true" />{/if}
              </span>
            {/if}
            <span class="name" use:tooltip={{ label: getEmbeddedLabel(stage.name) }}>{stage.name}</span>
            {#if stage.approval !== undefined}
              <span
                class="approval"
                class:is-missing={stage.gate?.kind === 'missing'}
                use:tooltip={{ label: hint.label, props: hint.params }}
              >
                {#if stage.gate?.kind === 'missing'}
                  <ShieldAlert size={12} aria-hidden="true" />
                {:else}
                  <ShieldCheck size={12} aria-hidden="true" />
                {/if}
                <span class="sr-only"><Label label={hint.label} params={hint.params} /></span>
              </span>
            {/if}
          </span>
        </li>
      {/if}
    {/each}
    {#if track.lost !== undefined}
      <li class="step lost" aria-current="step" bind:this={currentStep}>
        <span class="chip">
          <CircleX size={14} aria-hidden="true" />
          <span class="name" use:tooltip={{ label: getEmbeddedLabel(track.lost.name) }}>{track.lost.name}</span>
        </span>
      </li>
    {/if}
  </ol>
{/if}

<style>
  .stepper {
    position: relative;
    display: flex;
    align-items: center;
    margin: 0;
    padding: 0 0 0.25rem;
    list-style: none;
    overflow-x: auto;
    scrollbar-width: thin;
    font-size: 0.8125rem;
    line-height: 1.5rem;
  }

  .step {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    white-space: nowrap;
  }
  .step:not(:first-child)::before {
    content: '';
    width: 1.5rem;
    height: 1px;
    margin: 0 0.5rem;
    background: var(--border);
  }
  .done::before,
  .current::before {
    background: var(--primary);
  }
  .lost::before {
    background: none;
    border-top: 1px dashed var(--muted-foreground);
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    height: 1.5rem;
    border-radius: 9999px;
  }
  .current .chip,
  .lost .chip {
    padding: 0 0.625rem;
    font-weight: 500;
  }
  .current .chip {
    background: var(--primary);
    color: var(--primary-foreground);
  }
  .lost .chip {
    padding-left: 0.5rem;
    background: color-mix(in srgb, var(--destructive) 12%, transparent);
    color: var(--destructive);
  }

  .name {
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .node {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
  }
  .done {
    color: var(--foreground);
  }
  .done .node {
    background: var(--primary);
    color: var(--primary-foreground);
  }
  .upcoming {
    color: var(--muted-foreground);
  }
  .upcoming .node {
    border: 1.5px solid color-mix(in srgb, var(--muted-foreground) 50%, transparent);
  }
  .skipped,
  .is-unapproved {
    color: var(--muted-foreground);
  }
  .skipped .node {
    border: 1.5px dashed color-mix(in srgb, var(--muted-foreground) 70%, transparent);
  }

  .approval {
    display: flex;
    align-items: center;
  }
  .approval.is-missing {
    color: var(--theme-button-warning-color);
  }

  .is-lost .step:not(.lost) {
    opacity: 0.5;
  }
</style>
