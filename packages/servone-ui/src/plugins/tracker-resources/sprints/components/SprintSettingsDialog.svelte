<script lang="ts">
  import { Card, getClient } from '@hcengineering/presentation'
  import type { Project } from '@hcengineering/tracker'
  import { translate } from '@hcengineering/platform'
  import { DropdownLabels, Label, NumberInput, RadioButton, ToggleWithLabel, themeStore } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { projectStatuses, saveSettings, statusKindOf } from '../data'
  import type { EstimateScale } from '../lib/types'
  import { str } from '../plugin'
  import { projectSettings } from '../schema'

  export let project: Project

  const dispatch = createEventDispatcher()
  const client = getClient()
  const initial = projectSettings(project)

  let lengthDays = initial.lengthDays
  let autoCreate = initial.autoCreate
  let scale: EstimateScale = initial.scale
  let doneNeedsPoints = initial.doneNeedsPoints
  const limited = projectStatuses(client, project).filter((st) => ['todo', 'active'].includes(statusKindOf(client, st._id)))
  let limits: Record<string, number | undefined> = Object.fromEntries(limited.map((st) => [st.name, initial.wipLimits[st.name]]))

  const scales: Array<[EstimateScale, typeof str.Fibonacci]> = [
    ['fibonacci', str.Fibonacci],
    ['tshirt', str.TShirt],
    ['linear', str.Linear],
    ['off', str.Off]
  ]

  let duration: string = [7, 14, 21, 28].includes(lengthDays) ? String(lengthDays / 7) : 'custom'
  let durations: Array<{ id: string, label: string }> = []
  $: void Promise.all([
    ...[1, 2, 3, 4].map(async (count) => ({ id: String(count), label: await translate(str.Weeks, { count }, $themeStore.language) })),
    translate(str.Custom, {}, $themeStore.language).then((label) => ({ id: 'custom', label }))
  ]).then((r) => (durations = r))
  function pickDuration (id: string | undefined): void {
    if (id === undefined) return
    duration = id
    if (id !== 'custom') lengthDays = Number(id) * 7
  }

  async function save (): Promise<void> {
    const wipLimits: Record<string, number> = {}
    for (const [name, n] of Object.entries(limits)) {
      if (typeof n === 'number' && Number.isFinite(n) && n >= 1) wipLimits[name] = Math.round(n)
    }
    await saveSettings(client, project, {
      lengthDays: Math.max(1, Math.round(lengthDays)),
      autoCreate,
      scale,
      wipLimits,
      doneNeedsPoints: doneNeedsPoints && scale !== 'off'
    })
  }

</script>

<Card
  label={str.SprintSettings}
  okLabel={str.Save}
  okAction={save}
  canSave={lengthDays >= 1}
  width={'small'}
  gap={'gapV-4'}
  on:close={() => dispatch('close')}
>
  <div class="flex flex-col gap-4 text-sm">
    <div class="flex flex-col gap-1.5">
      <span class="text-xs text-muted-foreground"><Label label={str.SprintLength} /></span>
      <div class="flex items-center gap-2">
        <DropdownLabels items={durations} selected={duration} kind={'regular'} size={'medium'} showDropdownIcon on:selected={(e) => pickDuration(e.detail)} />
        {#if duration === 'custom'}
          <NumberInput bind:value={lengthDays} minValue={1} />
          <span class="text-muted-foreground"><Label label={str.DaysUnit} /></span>
        {/if}
      </div>
    </div>
    <ToggleWithLabel bind:on={autoCreate} label={str.AutoCreateNext} />
    <div class="flex flex-col gap-1.5">
      <span class="text-xs text-muted-foreground"><Label label={str.EstimateScale} /></span>
      <div class="grid grid-cols-2 gap-x-3 gap-y-2">
        {#each scales as [value, label]}
          <RadioButton bind:group={scale} {value} labelIntl={label} action={() => (scale = value)} />
        {/each}
      </div>
    </div>
    {#if scale !== 'off'}
      <ToggleWithLabel bind:on={doneNeedsPoints} label={str.DoneNeedsPoints} />
    {/if}
    {#if limited.length > 0}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-muted-foreground"><Label label={str.WipLimits} /></span>
        <p class="text-xs text-muted-foreground"><Label label={str.WipLimitsHint} /></p>
        {#each limited as st (st._id)}
          <div class="flex items-center justify-between gap-3">
            <span>{st.name}</span>
            <NumberInput bind:value={limits[st.name]} minValue={1} placeholder={str.NoLimit} />
          </div>
        {/each}
      </div>
    {/if}
  </div>
</Card>
