<script lang="ts">
  import core, { type AttachedData, type FindOptions, type Rank, type Ref, SortingOrder } from '@hcengineering/core'
  import { ObjectPopup, getClient } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/task'
  import { taskTypeStore } from '@hcengineering/task-resources'
  import type { Issue, IssueDraft } from '@hcengineering/tracker'
  import { createEventDispatcher } from 'svelte'
  import tracker from '../plugin'
  import IssueStatusIcon from './issues/IssueStatusIcon.svelte'
  import { isWorkflowKind } from './issues/workflowItem'

  type ParentChoice = Issue | null | undefined
  type ValueShape = Issue | AttachedData<Issue> | IssueDraft

  export let value: ValueShape | Issue[]
  export let width: 'medium' | 'large' | 'full' | 'resizable' = 'large'

  const dispatch = createEventDispatcher<{ close: ParentChoice, update: undefined }>()
  const client = getClient()

  const lookupOptions: FindOptions<Issue> = {
    lookup: { status: [tracker.class.IssueStatus, { category: core.class.StatusCategory }] },
    sort: { modifiedOn: SortingOrder.Descending }
  }

  function isIssueList (candidate: ValueShape | Issue[]): candidate is Issue[] {
    return Array.isArray(candidate)
  }

  function collectIgnoredIds (entries: ValueShape[]): Array<Ref<Issue>> {
    const ignoredIds = new Set<Ref<Issue>>()
    for (const entry of entries) {
      if ('_id' in entry) {
        ignoredIds.add(entry._id)
      }
      if ('childInfo' in entry) {
        for (const child of entry.childInfo) {
          ignoredIds.add(child.childId)
        }
      }
    }
    return Array.from(ignoredIds)
  }

  function collectWorkflowSpaces (entries: ValueShape[], taskTypes: typeof $taskTypeStore): Array<Issue['space']> {
    const workflowSpaces = new Set<Issue['space']>()
    for (const entry of entries) {
      if ('space' in entry && isWorkflowKind(entry.kind, taskTypes)) {
        workflowSpaces.add(entry.space)
      }
    }
    return Array.from(workflowSpaces)
  }

  async function moveUnder (entry: Issue, parent: Issue): Promise<void> {
    const lastChild = await client.findOne(
      tracker.class.Issue,
      { attachedTo: parent._id },
      { sort: { rank: SortingOrder.Descending } }
    )
    const nextRank: Rank = makeRank(lastChild?.rank, undefined)
    await client.update(entry, { attachedTo: parent._id, rank: nextRank })
  }

  async function applyChoice (choice: ParentChoice): Promise<void> {
    for (const entry of entries) {
      if (!('_class' in entry) || choice === undefined) continue
      if (choice !== null && (choice._id === entry.attachedTo || choice._id === entry._id)) continue
      if (choice === null) {
        await client.update(entry, { attachedTo: tracker.ids.NoParent })
      } else {
        await moveUnder(entry, choice)
      }
    }
  }

  async function handleClose (event: CustomEvent<ParentChoice>): Promise<void> {
    const choice = event.detail
    await applyChoice(choice)
    dispatch('close', choice)
  }

  $: entries = isIssueList(value) ? value : [value]
  $: preselectedParent = !isIssueList(value) && 'attachedTo' in value ? value.attachedTo : undefined
  $: ignoredIds = collectIgnoredIds(entries)
  $: workflowSpaces = collectWorkflowSpaces(entries, $taskTypeStore)
  $: spaceQuery = workflowSpaces.length > 0 ? { space: { $in: workflowSpaces } } : undefined
</script>

<ObjectPopup
  _class={tracker.class.Issue}
  options={lookupOptions}
  docQuery={spaceQuery}
  selected={preselectedParent}
  category={tracker.completion.IssueCategory}
  searchMode={'spotlight'}
  multiSelect={false}
  allowDeselect={true}
  create={undefined}
  placeholder={tracker.string.SetParent}
  ignoreObjects={ignoredIds}
  shadows={true}
  {width}
  on:update
  on:close={handleClose}
>
  <svelte:fragment slot="item" let:item={candidateIssue}>
    <div class="flex w-full h-9 items-center min-w-0">
      {#if candidateIssue.$lookup?.status}
        <div class="flex h-8 items-center mr-4 shrink-0">
          <IssueStatusIcon
            value={candidateIssue.$lookup.status}
            taskType={candidateIssue.kind}
            space={candidateIssue.space}
            size={'small'}
          />
        </div>
      {/if}
      <span class="shrink-0 truncate mr-3">{candidateIssue.identifier}</span>
      <span class="flex-1 min-w-0 truncate text-foreground">{candidateIssue.title}</span>
    </div>
  </svelte:fragment>
</ObjectPopup>
