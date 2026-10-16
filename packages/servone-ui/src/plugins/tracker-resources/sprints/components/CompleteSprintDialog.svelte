<script lang="ts">
  import { Card, getClient } from '@hcengineering/presentation'
  import type { Issue, Milestone, Project } from '@hcengineering/tracker'
  import { Button, Label, RadioButton, ToggleWithLabel } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { applyCompletion, toPlanIssue } from '../data'
  import { completeSprint, type RolloverTarget } from '../lib/lifecycle'
  import { totals } from '../lib/totals'
  import { isOpen } from '../lib/types'
  import { str } from '../plugin'
  import { projectSettings, toSprint } from '../schema'
  import { fmtDate } from '../ui'

  export let sprint: Milestone
  export let milestones: Milestone[]
  export let issues: Issue[]
  export let project: Project

  const dispatch = createEventDispatcher()
  const client = getClient()
  const settings = projectSettings(project)
  const sprints = milestones.map(toSprint)
  const plan = issues.map((it) => toPlanIssue(client, it))
  const t = totals(plan)
  const open = plan.filter((it) => isOpen(it.status) && !it.isEpic).length
  const nextSprint = sprints
    .filter((s) => s._id !== sprint._id && s.state === 'future')
    .sort((a, b) => (a.startDate ?? a.targetDate) - (b.startDate ?? b.targetDate))[0]
  const hasFuture = nextSprint !== undefined

  let target: RolloverTarget['kind'] = hasFuture ? 'next' : settings.autoCreate ? 'new' : 'backlog'
  let autoCreate = settings.autoCreate

  $: result = completeSprint(toSprint(sprint), sprints, plan, {
    target: { kind: target } as RolloverTarget,
    now: Date.now(),
    settings: { ...settings, autoCreate },
    projectName: project.identifier
  })

  async function save (): Promise<void> {
    if (!result.ok) return
    await applyCompletion(client, sprint, issues, result.value)
  }

</script>

<Card
  label={str.CompleteSprint}
  okLabel={str.Complete}
  okAction={save}
  canSave={result.ok}
  width={'small'}
  gap={'gapV-4'}
  on:close={() => dispatch('close')}
>
  <svelte:fragment slot="buttons">
    <Button label={str.Cancel} size={'large'} on:click={() => dispatch('close')} />
  </svelte:fragment>
  <div class="flex flex-col gap-3 text-sm">
    <div class="font-medium">{sprint.label}</div>
    <div class="tabular-nums text-muted-foreground">
      <Label label={str.DoneOpenSummary} params={{ done: t.doneCount, open }} />
    </div>
    {#if open > 0}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground"><Label label={str.MoveOpenIssuesTo} /></span>
        {#if nextSprint !== undefined}
          <RadioButton
            bind:group={target}
            value={'next'}
            labelIntl={str.NextSprint}
            labelParams={{ name: nextSprint.label, date: fmtDate(nextSprint.startDate ?? nextSprint.targetDate) }}
            action={() => (target = 'next')}
          />
        {/if}
        <RadioButton bind:group={target} value={'new'} labelIntl={str.NewSprint} action={() => (target = 'new')} />
        <RadioButton bind:group={target} value={'backlog'} labelIntl={str.BacklogTarget} action={() => (target = 'backlog')} />
      </div>
    {/if}
    {#if !hasFuture && target !== 'new'}
      <ToggleWithLabel bind:on={autoCreate} label={str.AutoCreateNext} />
    {/if}
  </div>
</Card>
