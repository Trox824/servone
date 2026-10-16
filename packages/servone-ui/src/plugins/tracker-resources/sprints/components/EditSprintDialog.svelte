<script lang="ts">
  import { Card, getClient } from '@hcengineering/presentation'
  import type { Milestone } from '@hcengineering/tracker'
  import ui, { DatePresenter, EditBox } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { updateSprint } from '../data'
  import { str } from '../plugin'
  import { toSprint } from '../schema'
  import { startOfDay } from '../ui'

  export let sprint: Milestone

  const dispatch = createEventDispatcher()
  const client = getClient()
  const current = toSprint(sprint)

  let label = sprint.label
  let goal = current.goal ?? ''
  let startT: number | null = current.startDate
  let endT: number | null = sprint.targetDate

  $: valid = label.trim() !== '' && endT != null && (startT == null || startOfDay(startT) <= startOfDay(endT))

  async function save (): Promise<void> {
    if (!valid || endT == null) return
    await updateSprint(client, sprint, {
      state: current.state,
      label: label.trim(),
      goal,
      startDate: startT != null ? startOfDay(startT) : null,
      targetDate: startOfDay(endT)
    })
  }
</script>

<Card
  label={str.EditSprint}
  okLabel={str.Save}
  okAction={save}
  canSave={valid}
  width={'small'}
  gap={'gapV-4'}
  on:close={() => dispatch('close')}
>
  <EditBox bind:value={label} placeholder={str.SprintName} kind={'large-style'} autoFocus />
  <EditBox bind:value={goal} placeholder={str.SprintGoalPlaceholder} />
  <svelte:fragment slot="pool">
    <DatePresenter bind:value={startT} editable label={str.StartDate} detail={ui.string.SelectDate} kind={'regular'} size={'large'} />
    <DatePresenter bind:value={endT} editable label={str.EndDate} detail={ui.string.SelectDate} kind={'regular'} size={'large'} />
  </svelte:fragment>
</Card>
