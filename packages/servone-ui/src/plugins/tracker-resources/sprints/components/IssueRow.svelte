<!-- `data-issue` / `data-kb` let keyboard shortcuts (../keyboard.ts) press the row's own controls. -->
<script lang="ts">
  import type { Issue } from '@hcengineering/tracker'
  import { CheckBox, deviceOptionsStore as deviceInfo } from '@hcengineering/ui'
  import { issueMenu } from '../menu'
  import { createEventDispatcher } from 'svelte'
  import AssigneeEditor from '../../components/issues/AssigneeEditor.svelte'
  import SubIssuesSelector from '../../components/issues/edit/SubIssuesSelector.svelte'
  import IssuePresenter from '../../components/issues/IssuePresenter.svelte'
  import PriorityEditor from '../../components/issues/PriorityEditor.svelte'
  import StatusEditor from '../../components/issues/StatusEditor.svelte'
  import type { EstimateScale } from '../lib/types'
  import BlockedBadge from './BlockedBadge.svelte'
  import EpicButton from './EpicButton.svelte'
  import PointsButton from './PointsButton.svelte'

  export let issue: Issue
  export let epic: Issue | undefined = undefined
  export let epics: Issue[] = []
  export let scale: EstimateScale
  export let selected = false
  export let readonly = false
  export let dropBefore = false
  export let focused = false
  export let showEpic = true
  export let depth = 0

  const dispatch = createEventDispatcher<{ toggle: boolean, dragstart: DragEvent }>()
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="group relative flex {$deviceInfo.isMobile ? 'min-h-[52px] flex-wrap gap-y-0.5 py-2' : 'h-9'} items-center gap-2 border-b px-3 text-sm hover:bg-muted/60 {selected ? 'bg-primary/8' : ''} {focused
    ? 'bg-muted/60 shadow-[inset_2px_0_0_var(--primary)]'
    : ''}"
  data-issue={issue._id}
  style:padding-left={depth > 0 ? `${12 + depth * 24}px` : undefined}
  draggable={!readonly}
  on:dragstart={(e) => dispatch('dragstart', e)}
  on:contextmenu={(e) => issueMenu(e, issue)}
  on:dragover
  on:drop
>
  {#if dropBefore}
    <div class="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary"></div>
  {/if}
  {#if !$deviceInfo.isMobile}
    <div class="flex w-4 shrink-0 items-center {selected ? '' : 'opacity-0 group-hover:opacity-100'}">
      <CheckBox checked={selected} size={'small'} on:value={(e) => dispatch('toggle', e.detail)} />
    </div>
  {/if}
  <div class="shrink-0" data-kb="priority">
    <PriorityEditor value={issue} kind={'list'} size={'small'} isEditable={!readonly} />
  </div>
  <div class="{$deviceInfo.isMobile ? '' : 'w-24'} shrink-0" data-kb="open">
    <IssuePresenter value={issue} shouldShowAvatar kind={'list'} />
  </div>
  <div class="shrink-0" data-kb="status">
    <StatusEditor value={issue} kind={'list'} size={'small'} isEditable={!readonly} shouldShowLabel={false} />
  </div>
  <span class="min-w-0 {$deviceInfo.isMobile ? 'order-first line-clamp-2 basis-full whitespace-normal break-words' : 'truncate'}" title={issue.title}>{issue.title}</span>
  <BlockedBadge issueId={issue._id} />
  <SubIssuesSelector value={issue} size={'small'} kind={'link-bordered'} />
  <span class="flex-1"></span>
  {#if showEpic}
    <div class="contents" data-kb="epic"><EpicButton {issue} {epic} {epics} {readonly} /></div>
  {/if}
  <div class="contents" data-kb="points"><PointsButton {issue} {scale} {readonly} /></div>
  <div class="shrink-0" data-kb="assignee">
    <AssigneeEditor object={issue} kind={'list'} size={'small'} avatarSize={'card'} shouldShowName={false} {readonly} />
  </div>
  <slot />
</div>
