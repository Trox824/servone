<script lang="ts">
  import core, {
    type IdMap,
    type Ref,
    SortingOrder,
    type StatusCategory,
    type WithLookup,
    toIdMap
  } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import type { Issue, IssueStatus } from '@hcengineering/tracker'
  import {
    Icon,
    IconDetails,
    IconForward,
    Label,
    SelectPopup,
    Spinner,
    closeTooltip,
    getPlatformColorDef,
    navigate,
    themeStore,
    tooltip
  } from '@hcengineering/ui'
  import { statusStore } from '@hcengineering/view-resources'
  import { issueLinkFragmentProvider } from '../../../issues'
  import tracker from '../../../plugin'
  import { str } from '../../../sprints/plugin'
  import { isEpic } from '../../../sprints/setup'
  import { listIssueStatusOrder } from '../../../utils'
  import IssueStatusIcon from '../IssueStatusIcon.svelte'

  export let issue: WithLookup<Issue>

  interface SiblingEntry {
    id: Ref<Issue>
    icon: StatusCategory['icon'] | undefined
    isSelected: boolean
    text: string
    iconColor?: string
    category: { label: StatusCategory['label'], icon: StatusCategory['icon'] } | undefined
  }

  const siblingsQuery = createQuery()
  const parentQuery = createQuery()

  let siblings: WithLookup<Issue>[] = []
  let areSiblingsLoading = true
  let parent: Issue | undefined
  let categoryById: IdMap<StatusCategory> = new Map()

  void getClient()
    .findAll(core.class.StatusCategory, {})
    .then((categories) => {
      categoryById = toIdMap(categories)
    })

  $: parentId = issue.attachedTo !== tracker.ids.NoParent ? (issue.attachedTo as Ref<Issue>) : undefined

  $: if (parentId !== undefined) {
    siblingsQuery.query(
      tracker.class.Issue,
      { attachedTo: parentId },
      (found) => {
        siblings = found
        areSiblingsLoading = false
      },
      {
        sort: { modifiedOn: SortingOrder.Descending },
        lookup: { status: [tracker.class.IssueStatus, { category: core.class.StatusCategory }] }
      }
    )
    parentQuery.query(tracker.class.Issue, { _id: parentId }, (found) => {
      parent = found[0]
    }, { limit: 1 })
  } else {
    siblingsQuery.unsubscribe()
    parentQuery.unsubscribe()
    parent = undefined
    siblings = []
    areSiblingsLoading = false
  }

  $: parentStatus = parent !== undefined ? $statusStore.byId.get(parent.status) : undefined

  function orderByCategory (
    unordered: WithLookup<Issue>[],
    statusById: typeof $statusStore.byId
  ): WithLookup<Issue>[] {
    const rankOf = (sibling: WithLookup<Issue>): number =>
      listIssueStatusOrder.indexOf(
        statusById.get(sibling.status)?.category ?? task.statusCategory.UnStarted
      )
    return [...unordered].sort((left, right) => rankOf(left) - rankOf(right))
  }

  function buildEntries (
    ordered: WithLookup<Issue>[],
    statusById: typeof $statusStore.byId,
    isDark: boolean,
    categories: IdMap<StatusCategory>,
    currentId: Ref<Issue>
  ): SiblingEntry[] {
    return ordered.map((sibling) => {
      const lookedUpStatus: WithLookup<IssueStatus> | undefined = sibling.$lookup?.status
      const lookedUpCategory = lookedUpStatus?.$lookup?.category
      const colorName = lookedUpStatus?.color ?? lookedUpCategory?.color
      const categoryId = statusById.get(sibling.status)?.category
      const knownCategory = categoryId !== undefined ? categories.get(categoryId) : undefined
      const entry: SiblingEntry = {
        id: sibling._id,
        icon: lookedUpCategory?.icon,
        isSelected: sibling._id === currentId,
        text: `${sibling.identifier} ${sibling.title}`,
        category: knownCategory !== undefined ? { label: knownCategory.label, icon: knownCategory.icon } : undefined
      }
      if (colorName !== undefined) {
        entry.iconColor = getPlatformColorDef(colorName, isDark).icon
      }
      return entry
    })
  }

  $: orderedSiblings = orderByCategory(siblings, $statusStore.byId)
  $: position = orderedSiblings.findIndex((sibling) => sibling._id === issue._id) + 1
  $: total = orderedSiblings.length
  $: isParentEpic = parent !== undefined && isEpic(parent)
  $: entries = buildEntries(orderedSiblings, $statusStore.byId, $themeStore.dark, categoryById, issue._id)

  async function openIssue (target: Issue): Promise<void> {
    if (target._id === issue._id) return
    navigate(await issueLinkFragmentProvider(target))
  }

  async function openParent (): Promise<void> {
    closeTooltip()
    if (parent !== undefined) await openIssue(parent)
  }

  async function openSiblingById (siblingId: Ref<Issue>): Promise<void> {
    const sibling = siblings.find((candidate) => candidate._id === siblingId)
    if (sibling !== undefined) await openIssue(sibling)
  }
</script>

{#if parent !== undefined}
  <div class="flex min-w-0 max-w-full leading-normal rounded border border-border shadow-xs">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="group/parentpart flex flex-1 min-w-0 items-center py-1.5 px-3 cursor-pointer"
      use:tooltip={{ label: tracker.string.OpenParent, direction: 'bottom' }}
      on:click={openParent}
    >
      <span
        class="mr-2 px-1.5 rounded text-xs {isParentEpic
          ? 'text-[#c4b5fd] bg-[rgba(139,92,246,0.2)]'
          : 'text-muted-foreground bg-transparent'}"
      >
        <Label label={isParentEpic ? str.ParentEpic : str.ParentIssue} />
      </span>
      {#if parentStatus !== undefined}
        <span class="pr-2 flex items-center">
          <IssueStatusIcon space={parent.space} taskType={parent.kind} value={parentStatus} size={'small'} />
        </span>
      {/if}
      <span class="shrink-0 mr-2 truncate">{parent.identifier}</span>
      <span
        class="truncate opacity-80 transition-opacity duration-150 group-hover/parentpart:opacity-100 group-active/parentpart:opacity-80"
      >
        {parent.title}
      </span>
    </div>
    {#if areSiblingsLoading}
      <div class="relative flex items-center justify-center py-1.5 px-3 before:absolute before:left-0 before:inset-y-1.5 before:w-px before:bg-border">
        <Spinner size={'small'} />
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="relative flex min-w-0 shrink items-center py-1.5 px-3 cursor-pointer text-muted-foreground transition-colors duration-150 hover:text-foreground active:text-foreground/80 before:absolute before:left-0 before:inset-y-1.5 before:w-px before:bg-border"
        use:tooltip={{
          component: SelectPopup,
          props: { value: entries, onSelect: openSiblingById, showShadow: false, width: 'large' }
        }}
      >
        <span class="truncate">
          <Label
            label={isParentEpic ? str.PositionInEpic : str.PositionInParent}
            params={{ index: position, total }}
          />
        </span>
        <span class="ml-2 flex"><Icon icon={IconDetails} size={'small'} /></span>
        <span class="ml-1.5 flex"><Icon icon={IconForward} size={'small'} /></span>
      </div>
    {/if}
  </div>
{/if}
