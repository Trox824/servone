<script lang="ts">
  import { Card, getClient } from '@hcengineering/presentation'
  import type { Issue, Milestone, Project } from '@hcengineering/tracker'
  import { translate } from '@hcengineering/platform'
  import ui, { DatePresenter, DropdownLabels, EditBox, Label, themeStore } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { applyStart, toPlanIssue } from '../data'
  import { startSprint } from '../lib/lifecycle'
  import { DAY } from '../lib/types'
  import { str } from '../plugin'
  import { projectSettings, toSprint } from '../schema'
  import { startOfDay } from '../ui'

  export let sprint: Milestone
  export let milestones: Milestone[]
  export let issues: Issue[]
  export let project: Project

  const dispatch = createEventDispatcher()
  const client = getClient()
  const settings = projectSettings(project)
  const current = toSprint(sprint)

  let label = sprint.label
  let goal = current.goal ?? ''
  let startT: number | null = startOfDay(current.startDate ?? Date.now())
  const span =
    current.startDate !== null ? Math.round((sprint.targetDate - current.startDate) / DAY) + 1 : settings.lengthDays
  let duration: string = [7, 14, 21, 28].includes(span) ? String(span / 7) : 'custom'
  let endT: number | null = startOfDay(current.startDate !== null ? sprint.targetDate : Date.now() + (span - 1) * DAY)

  let durations: Array<{ id: string, label: string }> = []
  $: void Promise.all([
    ...[1, 2, 3, 4].map(async (count) => ({ id: String(count), label: await translate(str.Weeks, { count }, $themeStore.language) })),
    translate(str.Custom, {}, $themeStore.language).then((label) => ({ id: 'custom', label }))
  ]).then((r) => (durations = r))

  $: weeks = duration === 'custom' ? undefined : Number(duration)
  $: if (weeks !== undefined && startT != null) endT = startOfDay(startT + (weeks * 7 - 1) * DAY)
  $: plan = issues.map((it) => toPlanIssue(client, it))
  $: result =
    startT != null && endT != null
      ? startSprint(current, milestones.map(toSprint), plan, {
        label,
        goal,
        startDate: startOfDay(startT),
        targetDate: startOfDay(endT)
      })
      : undefined
  $: unpointed = plan.filter((it) => it.points === null && !it.isEpic && it.status !== 'canceled').length
  $: warnings = result?.ok === true ? result.warnings.filter((w) => w !== 'unpointed' || settings.scale !== 'off') : []

  async function save (): Promise<void> {
    if (result?.ok !== true) return
    await applyStart(client, project, sprint, result.value, issues)
  }

</script>

<Card
  label={str.StartSprint}
  okLabel={str.Start}
  okAction={save}
  canSave={result?.ok === true && label.trim() !== ''}
  width={'small'}
  gap={'gapV-4'}
  on:close={() => dispatch('close')}
>
  <EditBox bind:value={label} placeholder={str.SprintName} kind={'large-style'} autoFocus />
  <EditBox bind:value={goal} placeholder={str.SprintGoalPlaceholder} />
  <div class="flex flex-col gap-2 text-sm">
    {#each warnings as w}
      <p class="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
        {#if w === 'another-active'}
          <Label label={str.WarnAnotherActive} />
        {:else if w === 'no-issues'}
          <Label label={str.WarnNoIssues} />
        {:else}
          <Label label={str.WarnUnpointed} params={{ count: unpointed }} />
        {/if}
      </p>
    {/each}
  </div>
  <svelte:fragment slot="pool">
    <DatePresenter bind:value={startT} editable label={str.StartDate} detail={ui.string.SelectDate} kind={'regular'} size={'large'} />
    <DropdownLabels items={durations} bind:selected={duration} kind={'regular'} size={'large'} label={str.Duration} />
    <DatePresenter
      bind:value={endT}
      editable={duration === 'custom'}
      label={str.EndDate}
      detail={ui.string.SelectDate}
      kind={'regular'}
      size={'large'}
    />
  </svelte:fragment>
</Card>
