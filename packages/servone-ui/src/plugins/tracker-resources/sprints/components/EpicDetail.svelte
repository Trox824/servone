<script lang="ts">
  import { getClient } from '@hcengineering/presentation'
  import type { Issue, Project } from '@hcengineering/tracker'
  import { Button, IconAdd, Label, showPopup } from '@hcengineering/ui'
  import { openDoc } from '@hcengineering/view-resources'
  import AssigneeEditor from '../../components/issues/AssigneeEditor.svelte'
  import StatusEditor from '../../components/issues/StatusEditor.svelte'
  import CreateIssue from '../../components/CreateIssue.svelte'
  import type { EpicProgress } from '../lib/totals'
  import type { EstimateScale } from '../lib/types'
  import { str } from '../plugin'
  import { fmtDate } from '../ui'
  import EpicIssueList from './EpicIssueList.svelte'
  import EpicProgressBar from './EpicProgressBar.svelte'

  export let project: Project
  export let epic: Issue
  export let issues: Issue[]
  export let epics: Issue[]
  export let statusOrder: string[]
  export let progress: EpicProgress
  export let scale: EstimateScale

  const client = getClient()

  function addIssue (): void {
    showPopup(CreateIssue, { space: project._id, parentIssue: epic, shouldSaveDraft: false }, 'top')
  }
</script>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pb-10 pt-6 text-sm">
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <StatusEditor value={epic} kind={'list'} size={'small'} shouldShowLabel />
      <span>·</span>
      <span>{epic.identifier}</span>
    </div>
    <h1 class="text-2xl font-semibold tracking-tight text-foreground">{epic.title}</h1>
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
      <span class="flex items-center gap-2"><AssigneeEditor object={epic} kind={'list'} size={'small'} shouldShowName /></span>
      <span><Label label={str.StartDate} />: <span class="text-foreground">{fmtDate(epic.startDate)}</span></span>
      <span><Label label={str.TargetDate} />: <span class="text-foreground">{fmtDate(epic.dueDate)}</span></span>
      <span class="flex-1"></span>
      <Button kind={'ghost'} size={'small'} label={str.OpenAsIssue} on:click={() => openDoc(client.getHierarchy(), epic)} />
    </div>
  </div>

  <div class="rounded-lg border bg-muted/30 p-4">
    <EpicProgressBar {progress} {scale} legend />
  </div>

  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium"><Label label={str.Children} /> · {progress.count}</span>
      <span class="text-xs text-muted-foreground"><Label label={str.EpicHint} /></span>
      <span class="flex-1"></span>
      <Button icon={IconAdd} kind={'regular'} size={'small'} label={str.AddIssue} on:click={addIssue} />
    </div>
    {#if issues.some((it) => it.attachedTo === epic._id)}
      <div class="overflow-hidden rounded-lg border bg-background">
        <EpicIssueList {epic} {issues} {epics} {statusOrder} {scale} />
      </div>
    {:else}
      <div class="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <Label label={str.NoEpicIssues} />
      </div>
    {/if}
  </div>
</div>
