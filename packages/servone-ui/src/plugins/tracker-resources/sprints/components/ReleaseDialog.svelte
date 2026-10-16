<script lang="ts">
  import { Card, getClient } from '@hcengineering/presentation'
  import type { TagElement } from '@hcengineering/tags'
  import type { Project } from '@hcengineering/tracker'
  import ui, { DatePresenter, EditBox } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { str } from '../plugin'
  import { createRelease, toRelease, updateRelease } from '../releases'
  import { startOfDay } from '../ui'

  export let project: Project
  /** The release to edit; a new one when absent. */
  export let release: TagElement | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const current = release !== undefined ? toRelease(release) : undefined

  let name = current?.name ?? ''
  let description = current?.description ?? ''
  let startT: number | null = current?.startDate ?? null
  let endT: number | null = current?.releaseDate ?? null

  $: valid = name.trim() !== '' && (startT == null || endT == null || startOfDay(startT) <= startOfDay(endT))

  async function save (): Promise<void> {
    if (!valid) return
    const data = {
      name: name.trim(),
      description,
      startDate: startT != null ? startOfDay(startT) : undefined,
      releaseDate: endT != null ? startOfDay(endT) : undefined
    }
    if (release !== undefined) await updateRelease(client, release, data)
    else await createRelease(client, project, data)
  }
</script>

<Card
  label={release !== undefined ? str.EditRelease : str.CreateRelease}
  okLabel={release !== undefined ? str.Save : str.CreateRelease}
  okAction={save}
  canSave={valid}
  width={'small'}
  gap={'gapV-4'}
  on:close={() => dispatch('close')}
>
  <EditBox bind:value={name} placeholder={str.ReleaseName} kind={'large-style'} autoFocus />
  <EditBox bind:value={description} placeholder={str.ReleaseDescriptionPlaceholder} />
  <svelte:fragment slot="pool">
    <DatePresenter bind:value={startT} editable label={str.StartDate} detail={ui.string.SelectDate} kind={'regular'} size={'large'} />
    <DatePresenter bind:value={endT} editable label={str.ReleaseDate} detail={ui.string.SelectDate} kind={'regular'} size={'large'} />
  </svelte:fragment>
</Card>
