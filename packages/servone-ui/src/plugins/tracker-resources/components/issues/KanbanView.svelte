<script lang="ts">
  import { AttachmentsPresenter } from '@hcengineering/attachment-resources'
  import { ChatMessagesPresenter } from '@hcengineering/chunter-resources'
  import {
    type CategoryType,
    type Class,
    type Doc,
    type DocumentQuery,
    type DocumentUpdate,
    type FindOptions,
    generateId,
    mergeQueries,
    type Ref,
    type RefTo,
    type WithLookup
  } from '@hcengineering/core'
  import { type Item, Kanban } from '@hcengineering/kanban'
  import notification from '@hcengineering/notification'
  import { ActionContext, createQuery, getClient } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import task, { type DocWithRank, getStates } from '@hcengineering/task'
  import { getTaskKanbanResultQuery, taskTypeStore, typeStore, updateTaskKanbanCategories } from '@hcengineering/task-resources'
  import { type Issue, IssuesGrouping, IssuesOrdering, type Project } from '@hcengineering/tracker'
  import {
    Button,
    type ColorDefinition,
    Component,
    defaultBackground,
    getEventPositionElement,
    IconAdd,
    IconCollapseArrow,
    IconMoreH,
    Label,
    Loading,
    SelectPopup,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import view, { type AttributeModel, type BuildModelKey, type Viewlet, type ViewOptionModel, type ViewOptions } from '@hcengineering/view'
  import {
    claimResultCountOwner,
    enabledConfig,
    focusStore,
    getCategoryQueryNoLookup,
    getCategoryQueryNoLookupOptions,
    getCategoryQueryProjection,
    getGroupByValues,
    getPresenter,
    groupBy,
    ListSelectionProvider,
    noCategory,
    openDoc,
    releaseResultCountOwner,
    type SelectDirection,
    setGroupByValues,
    setResultCount,
    setViewOptions,
    showMenu,
    statusStore
  } from '@hcengineering/view-resources'
  import { onDestroy, onMount } from 'svelte'
  import tracker from '../../plugin'
  import { activeProjects } from '../../utils'
  import { isEpic } from '../../sprints/setup'
  import { str as sprintStr } from '../../sprints/plugin'
  import BlockedBadge from '../../sprints/components/BlockedBadge.svelte'
  import AwaitingApprovalBadge from '../../sprints/components/AwaitingApprovalBadge.svelte'
  import CreateIssue from '../CreateIssue.svelte'
  import MilestoneEditor from '../milestones/MilestoneEditor.svelte'
  import AssigneeEditor from './AssigneeEditor.svelte'
  import DueDatePresenter from './DueDatePresenter.svelte'
  import SubIssuesSelector from './edit/SubIssuesSelector.svelte'
  import IssuePresenter from './IssuePresenter.svelte'
  import ParentNamesPresenter from './ParentNamesPresenter.svelte'
  import PriorityEditor from './PriorityEditor.svelte'
  import StatusEditor from './StatusEditor.svelte'
  import EstimationEditor from './timereport/EstimationEditor.svelte'
  import { isWorkflowKind } from './workflowItem'

  export let space: Ref<Project> | undefined = undefined
  export let baseMenuClass: Ref<Class<Doc>> | undefined = undefined
  export let query: DocumentQuery<Issue> = {}
  export let viewOptionsConfig: ViewOptionModel[] | undefined = undefined
  export let viewOptions: ViewOptions
  export let viewlet: Viewlet
  export let config: Array<string | BuildModelKey>
  export let options: FindOptions<DocWithRank> | undefined = undefined

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const FAST_QUERY_LIMIT = 1000 // first paint budget before the unlimited query catches up
  const columnRequestId = generateId()
  const resultCountToken = claimResultCountOwner()

  let kanbanBoard: Kanban
  let hasLoadedColumns = false
  let columns: CategoryType[] = []
  let boardQuery: DocumentQuery<Issue> = { ...query }
  let fastDocs: Item[] = []
  let fullDocs: Item[] = []
  let headerPresenter: AttributeModel | undefined
  let headerColourByColumn: Record<string, ColorDefinition> = {}
  let filledLabelFlags: Record<string, boolean> = {}
  let isHiddenListOpen = true

  const boardSelection = new ListSelectionProvider(
    (offset: 1 | -1 | 0, of?: Doc, dir?: SelectDirection) => {
      kanbanBoard?.select(offset, of, dir)
    }
  )
  const checkedDocs = boardSelection.selection

  const fastQuery = createQuery()
  const fullQuery = createQuery()

  $: groupingKey = viewOptions.groupBy[0] ?? noCategory
  $: sortField = viewOptions.orderBy?.[0]
  $: dontUpdateRank = sortField !== IssuesOrdering.Manual
  $: isSprintBoard = typeof query.milestone === 'string'
  $: columnViewOptions = isSprintBoard ? { ...viewOptions, shouldShowAll: true } : viewOptions
  $: currentProject = $activeProjects.get(space ?? tracker.project.DefaultProject)

  $: void refreshBoardQuery(query, viewOptionsConfig, viewOptions)
  $: lookupFreeQuery = getCategoryQueryNoLookup(boardQuery)
  $: boardFindOptions = buildBoardFindOptions(options, viewOptions.orderBy)
  $: columnDataOptions = buildColumnDataOptions(boardFindOptions, lookupFreeQuery, viewOptions.groupBy)

  $: fastQuery.query(
    tracker.class.Issue,
    lookupFreeQuery,
    (fastMatches) => {
      fastDocs = fastMatches
      setResultCount(resultCountToken, fastMatches.length)
    },
    { ...columnDataOptions, limit: FAST_QUERY_LIMIT }
  )
  $: fullQuery.query(
    tracker.class.Issue,
    lookupFreeQuery,
    (allMatches) => {
      fullDocs = allMatches
    },
    columnDataOptions
  )

  $: mergedDocs = combineFastAndFull(fastDocs, fullDocs)
  $: boardSelection.update(mergedDocs)

  $: void reloadColumns(mergedDocs, groupingKey, columnViewOptions, viewOptionsConfig, space, viewlet)
  $: groupedDocs = groupBy(mergedDocs, groupingKey, columns)

  $: void resolveHeaderPresenter(groupingKey)

  $: hiddenKeys = new Set<string>(viewOptions.hiddenColumns ?? [])
  $: shownColumns = pickShownColumns(
    columns,
    hiddenKeys,
    groupedDocs,
    isSprintBoard,
    groupingKey,
    $statusStore.byId
  )
  $: hiddenPanelColumns = columns.filter((column) => hiddenKeys.has(columnKey(column)))

  onMount(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  })

  onDestroy(() => {
    releaseResultCountOwner(resultCountToken)
  })

  async function refreshBoardQuery (
    hostQuery: DocumentQuery<Issue>,
    optionsConfig: ViewOptionModel[] | undefined,
    currentViewOptions: ViewOptions
  ): Promise<void> {
    const taskQuery = await getTaskKanbanResultQuery(hierarchy, hostQuery, optionsConfig, currentViewOptions)
    boardQuery = mergeQueries(taskQuery, hostQuery)
  }

  function buildBoardFindOptions (
    baseOptions: FindOptions<DocWithRank> | undefined,
    orderBy: ViewOptions['orderBy']
  ): FindOptions<Issue> {
    const built: FindOptions<Issue> = {
      ...baseOptions,
      lookup: {
        ...baseOptions?.lookup,
        attachedTo: tracker.class.Issue,
        _id: { subIssues: tracker.class.Issue }
      }
    }
    if (orderBy !== undefined) {
      built.sort = { [orderBy[0]]: orderBy[1] }
    }
    return built
  }

  function buildColumnDataOptions (
    boardOptions: FindOptions<Issue>,
    noLookupQuery: DocumentQuery<Issue>,
    groupByKeys: ViewOptions['groupBy']
  ): FindOptions<Issue> {
    const noLookupOptions = getCategoryQueryNoLookupOptions(boardOptions)
    return {
      ...noLookupOptions,
      projection: {
        ...boardOptions.projection,
        _id: 1,
        _class: 1,
        rank: 1,
        ...getCategoryQueryProjection(hierarchy, tracker.class.Issue, noLookupQuery, groupByKeys)
      }
    }
  }

  function combineFastAndFull (fastMatches: Item[], allMatches: Item[]): Item[] {
    const fastIds = new Set(fastMatches.map((doc) => doc._id))
    return [...fastMatches, ...allMatches.filter((doc) => !fastIds.has(doc._id))]
  }

  function refreshColumns (): void {
    void reloadColumns(mergedDocs, groupingKey, columnViewOptions, viewOptionsConfig, space, viewlet)
  }

  async function reloadColumns (
    docs: Item[],
    key: string,
    columnOptions: ViewOptions,
    optionsConfig: ViewOptionModel[] | undefined,
    projectRef: Ref<Project> | undefined,
    activeViewlet: Viewlet
  ): Promise<void> {
    const loadedColumns = await updateTaskKanbanCategories(
      client,
      activeViewlet,
      tracker.class.Issue,
      projectRef,
      docs,
      key,
      columnOptions,
      optionsConfig,
      refreshColumns,
      columnRequestId
    )
    columns = loadedColumns
    hasLoadedColumns = true
  }

  async function resolveHeaderPresenter (key: string): Promise<void> {
    if (key === noCategory) {
      headerPresenter = undefined
      return
    }
    const presenterModel = await getPresenter(client, tracker.class.Issue, { key }, { key })
    if (key === groupingKey) {
      headerPresenter = presenterModel
    }
  }

  function columnKey (column: CategoryType): string {
    return typeof column === 'object' ? String(column.name) : String(column)
  }

  function pickShownColumns (
    allColumns: CategoryType[],
    hiddenColumnKeys: Set<string>,
    docsByGroup: Record<string | number, Item[]>,
    isSprint: boolean,
    key: string,
    statusById: Map<string, { category?: string }>
  ): CategoryType[] {
    const dropsEmptyBacklog = isSprint && key === IssuesGrouping.Status
    return allColumns.filter((column) => {
      if (hiddenColumnKeys.has(columnKey(column))) return false
      if (!dropsEmptyBacklog || typeof column !== 'string') return true
      const isEmpty = getGroupByValues(docsByGroup, column).length === 0
      const isBacklogStatus = statusById.get(column)?.category === task.statusCategory.UnStarted
      return !(isEmpty && isBacklogStatus)
    })
  }

  function setColumnHidden (column: CategoryType, shouldHide: boolean): void {
    const nextKeys = new Set(hiddenKeys)
    if (shouldHide) {
      nextKeys.add(columnKey(column))
    } else {
      nextKeys.delete(columnKey(column))
    }
    viewOptions = { ...viewOptions, hiddenColumns: Array.from(nextKeys) }
    void setViewOptions(viewlet, viewOptions)
  }

  function selectColumnDocs (docsByGroup: Record<string | number, Item[]>, column: CategoryType): Item[] {
    if (groupingKey === noCategory) return mergedDocs
    return getGroupByValues(docsByGroup, column)
  }

  function getUpdateProps (doc: Item, column: CategoryType): DocumentUpdate<Item> | undefined {
    const targetValue = typeof column === 'object' ? column.values.find((entry) => entry.space === doc.space)?._id : column
    if (targetValue === undefined) return undefined
    return { [groupingKey]: targetValue, space: doc.space }
  }

  async function getAvailableCategories (doc: Item): Promise<CategoryType[]> {
    const droppedIssue = boardItemAsIssueDoc(doc)
    if (groupingKey === IssuesGrouping.Component || groupingKey === IssuesGrouping.Milestone) {
      const currentValue = Reflect.get(droppedIssue, groupingKey)
      const targetClass = (hierarchy.getAttribute(tracker.class.Issue, groupingKey).type as RefTo<Doc>).to
      const allowedColumns: CategoryType[] = []
      for (const column of columns) {
        if (!column || column === currentValue || targetClass === undefined) {
          allowedColumns.push(column)
          continue
        }
        const linkedDoc = await client.findOne(targetClass, { _id: column, space: droppedIssue.space })
        if (linkedDoc !== undefined) {
          allowedColumns.push(column)
        }
      }
      return allowedColumns
    }
    if (groupingKey === IssuesGrouping.Status) {
      const issueProject = await client.findOne(tracker.class.Project, { _id: droppedIssue.space })
      return getStates(issueProject, $typeStore, $statusStore.byId).map((status) => status._id)
    }
    return columns
  }

  function rememberHeaderColour (index: number, colour: ColorDefinition): void {
    headerColourByColumn = {
      ...headerColourByColumn,
      [`${index}:${$themeStore.dark}:${groupingKey}`]: colour
    }
  }

  function openColumnMenu (event: MouseEvent, column: CategoryType): void {
    showPopup(
      SelectPopup,
      { value: [{ id: 'hide', label: sprintStr.HideColumn }] },
      getEventPositionElement(event),
      (selectedAction) => {
        if (selectedAction === 'hide') {
          setColumnHidden(column, true)
        }
      }
    )
  }

  function openCreateIssue (column: CategoryType): void {
    const createProps = { space: space ?? tracker.project.DefaultProject, [groupingKey]: column }
    if (isSprintBoard) {
      createProps.milestone = query.milestone
    }
    showPopup(CreateIssue, createProps, 'top')
  }

  function boardItemAsIssueDoc (boardItem: Item): WithLookup<Issue> {
    return boardItem as WithLookup<Issue>
  }

  function sumReportedTime (issue: WithLookup<Issue>): number {
    return issue.reportedTime + (issue.childInfo ?? []).reduce((total, child) => total + child.reportedTime, 0)
  }

  function sumChildEstimate (issue: WithLookup<Issue>): number {
    return (issue.childInfo ?? []).reduce((total, child) => total + child.estimation, 0)
  }

  async function shouldShowCardFooter (
    issue: WithLookup<Issue>,
    enabledParts: Array<string | BuildModelKey>
  ): Promise<boolean> {
    const hasTime = enabledConfig(enabledParts, 'estimation') && (sumReportedTime(issue) > 0 || sumChildEstimate(issue) > 0)
    const hasComments =
      enabledConfig(enabledParts, 'comments') && ((issue.comments ?? 0) > 0 || (issue.$lookup?.attachedTo?.comments ?? 0) > 0)
    const hasAttachments = enabledConfig(enabledParts, 'attachments') && (issue.attachments ?? 0) > 0
    return hasTime || hasComments || hasAttachments
  }

  function rememberLabelsFilled (issueId: string, detail: { full?: boolean }): void {
    if (detail.full) {
      filledLabelFlags = { ...filledLabelFlags, [issueId]: true }
    }
  }
</script>

<ActionContext context={{ mode: 'browser' }} />

{#if hasLoadedColumns}
  <div class="flex min-h-0 min-w-0 flex-1">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <Kanban
        bind:this={kanbanBoard}
        categories={shownColumns}
        {dontUpdateRank}
        _class={tracker.class.Issue}
        query={boardQuery}
        options={boardFindOptions}
        objects={mergedDocs}
        groupByDocs={groupedDocs}
        groupByKey={groupingKey}
        {setGroupByValues}
        getGroupByValues={selectColumnDocs}
        {getUpdateProps}
        {getAvailableCategories}
        selection={boardSelection.current($focusStore)}
        checked={$checkedDocs ?? []}
        on:obj-focus={(event) => boardSelection.updateFocus(event.detail)}
        on:check={(event) => boardSelection.updateSelection(event.detail.docs, event.detail.value)}
        on:contextmenu={(event) => showMenu(event.detail.evt, { object: event.detail.objects, baseMenuClass })}
      >
        <svelte:fragment slot="header" let:state let:count let:index>
          {@const colourMemory = headerColourByColumn[`${index}:${$themeStore.dark}:${groupingKey}`]}
          <div
            class="header flex-between"
            style:background={colourMemory?.background ?? defaultBackground($themeStore.dark)}
          >
            <div class="title-row">
              <span
                class="clear-mins fs-bold overflow-label column-title"
                style:color={colourMemory?.title ?? 'var(--theme-caption-color)'}
              >
                {#if groupingKey === noCategory}
                  <Label label={view.string.NoGrouping} />
                {:else if headerPresenter}
                  <svelte:component
                    this={headerPresenter.presenter}
                    value={state}
                    {space}
                    size={'small'}
                    kind={'list-header'}
                    display={'kanban'}
                    colorInherit={!$themeStore.dark}
                    accent={true}
                    on:accent-color={(event) => rememberHeaderColour(index, event.detail)}
                  />
                {/if}
              </span>
              <span class="counter">{count}</span>
            </div>
            <div class="tools">
              <Button
                kind={'ghost'}
                icon={IconMoreH}
                showTooltip={{ label: sprintStr.ColumnOptions, direction: 'left' }}
                on:click={(event) => openColumnMenu(event, state)}
              />
              <Button
                kind={'ghost'}
                icon={IconAdd}
                showTooltip={{ label: tracker.string.AddIssueTooltip, direction: 'left' }}
                on:click={() => openCreateIssue(state)}
              />
            </div>
          </div>
        </svelte:fragment>

        <svelte:fragment slot="card" let:object>
          {#key object._id}
            {@const issue = boardItemAsIssueDoc(object)}
            {@const isWorkflowItem = isWorkflowKind(issue.kind, $taskTypeStore)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="tracker-card" on:click={() => void openDoc(hierarchy, issue)}>
              <div class="card-header flex-between">
                <div class="flex-row-center text-sm">
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="mr-1" on:click|stopPropagation>
                    <StatusEditor value={issue} kind="list" isEditable />
                  </div>
                  <div class="shrink-0">
                    <IssuePresenter value={issue} shouldShowAvatar />
                  </div>
                  {#if isEpic(issue)}
                    <span class="epic-tag"><Label label={sprintStr.Epic} /></span>
                  {/if}
                  <ParentNamesPresenter value={issue} />
                </div>
                <div class="card-header-end">
                  <Component is={notification.component.NotificationPresenter} props={{ value: object }} />
                  <AssigneeEditor object={issue} avatarSize="card" shouldShowName={false} />
                </div>
              </div>
              <div class="card-content">{issue.title}</div>
              <div class="card-labels">
                <BlockedBadge issueId={issue._id} label />
                <AwaitingApprovalBadge {issue} />
                {#if enabledConfig(config, 'subIssues') && issue.subIssues > 0}
                  <SubIssuesSelector value={issue} currentProject={currentProject} size="small" />
                {/if}
                {#if enabledConfig(config, 'priority')}
                  <PriorityEditor value={issue} isEditable kind="link-bordered" size="small" justify="center" />
                {/if}
                {#if enabledConfig(config, 'milestone') && !isEpic(issue) && !isSprintBoard && !isWorkflowItem}
                  <MilestoneEditor
                    value={issue}
                    {space}
                    isEditable
                    kind="link-bordered"
                    size="small"
                    justify="center"
                  />
                {/if}
                {#if enabledConfig(config, 'dueDate')}
                  <DueDatePresenter value={issue} size="small" kind="link-bordered" />
                {/if}
              </div>
              {#if enabledConfig(config, 'labels')}
                <div class="card-labels labels">
                  <Component
                    is={tags.component.LabelsPresenter}
                    props={{
                      value: issue.labels,
                      object: issue,
                      ckeckFilled: filledLabelFlags[issue._id] ?? false,
                      kind: 'link',
                      compression: true
                    }}
                    on:change={(event) => rememberLabelsFilled(issue._id, event.detail)}
                  />
                </div>
              {/if}
              {#await shouldShowCardFooter(issue, config) then isFooterNeeded}
                {#if isFooterNeeded}
                  <div class="card-footer flex-between">
                    {#if enabledConfig(config, 'estimation')}
                      <EstimationEditor kind="list" size="small" value={issue} />
                    {/if}
                    <div class="card-footer-end">
                      {#if enabledConfig(config, 'attachments') && (issue.attachments ?? 0) > 0}
                        <AttachmentsPresenter value={issue.attachments} object={issue} />
                      {/if}
                      <ChatMessagesPresenter value={issue.comments} object={issue} />
                      <ChatMessagesPresenter
                        object={issue.$lookup?.attachedTo}
                        value={issue.$lookup?.attachedTo?.comments}
                        withInput={false}
                      />
                    </div>
                  </div>
                {:else}
                  <div class="h-4 min-h-4 max-h-4"></div>
                {/if}
              {/await}
            </div>
          {/key}
        </svelte:fragment>
      </Kanban>
    </div>

    {#if hiddenPanelColumns.length > 0}
      <div class="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto px-3 pb-3 text-sm">
        <button
          type="button"
          class="flex h-8 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          on:click={() => (isHiddenListOpen = !isHiddenListOpen)}
        >
          <span class="flex transition-transform" class:rotate-90={isHiddenListOpen}>
            <IconCollapseArrow size={'small'} />
          </span>
          <Label label={sprintStr.HiddenColumns} />
        </button>
        {#if isHiddenListOpen}
          {#each hiddenPanelColumns as column (columnKey(column))}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="flex h-10 cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 hover:bg-muted"
              on:click={() => setColumnHidden(column, false)}
            >
              <span class="min-w-0 truncate">
                {#if headerPresenter}
                  <svelte:component
                    this={headerPresenter.presenter}
                    value={column}
                    {space}
                    size={'small'}
                    kind={'list-header'}
                    display={'kanban'}
                  />
                {:else}
                  {columnKey(column)}
                {/if}
              </span>
              <span class="text-xs tabular-nums text-muted-foreground">
                {getGroupByValues(groupedDocs, column).length}
              </span>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <Loading />
{/if}

<style>
  .header {
    margin: 0 12px 8px;
    padding: 0 8px 0 20px;
    height: 40px;
    min-height: 40px;
    border: 1px solid var(--theme-divider-color);
    border-radius: 4px;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .column-title {
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }
  .counter {
    margin-left: 4px;
    color: var(--theme-dark-color);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
  }
  .header:hover .tools {
    opacity: 1;
  }

  .tracker-card {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 104px;
    border-radius: 4px;
  }
  .card-header {
    padding: 12px 16px 0;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }
  .card-header-end {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 8px;
  }
  .card-content {
    margin: 8px 16px;
    font-size: 0.875rem;
    color: var(--theme-caption-color);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .card-labels {
    display: flex;
    flex-wrap: nowrap;
    margin: 0 12px 0 16px;
    min-width: 0;
  }
  .card-labels.labels {
    overflow: hidden;
    flex-shrink: 1;
    margin: 0 16px;
    width: calc(100% - 2rem);
    border-radius: 0 0.24rem 0.24rem 0;
  }
  .card-footer {
    margin-top: 16px;
    padding: 12px 16px;
    background: var(--theme-kanban-card-footer);
    border-radius: 0 0 4px 4px;
    justify-content: space-between;
  }
  .card-footer-end {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .epic-tag {
    flex-shrink: 0;
    margin-left: 6px;
    padding: 0 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    line-height: 18px;
    color: #a78bfa;
    background: rgb(139 92 246 / 0.15);
  }
</style>
