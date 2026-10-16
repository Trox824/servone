<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { AttachmentStyleBoxCollabEditor } from '@hcengineering/attachment-resources'
  import { type Class, type Doc, type Ref, SortingOrder, type WithLookup } from '@hcengineering/core'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import { Panel } from '@hcengineering/panel'
  import presentation, {
    ActionContext,
    ComponentExtensions,
    contextStore,
    createQuery,
    getClient
  } from '@hcengineering/presentation'
  import setting, { settingId } from '@hcengineering/setting'
  import { makeRank } from '@hcengineering/task'
  import { taskTypeStore, typeStore } from '@hcengineering/task-resources'
  import { type Issue, TrackerEvents } from '@hcengineering/tracker'
  import {
    Button,
    Component,
    deviceOptionsStore,
    EditBox,
    FocusHandler,
    IconClose,
    IconMixin,
    IconMoreH,
    Label,
    createFocusManager,
    getCurrentResolvedLocation,
    navigate,
    showPopup
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { DocNavLink, ParentsNavigator, showMenu, RelationsEditor } from '@hcengineering/view-resources'
  import { createEventDispatcher, onDestroy } from 'svelte'
  import SetParentIssueActionPopup from '../../SetParentIssueActionPopup.svelte'
  import HierarchyAddPopup from '../HierarchyAddPopup.svelte'
  import ProjectPresenter from '../../projects/ProjectPresenter.svelte'
  import ApprovalBlock from '../../../../request-resources/components/ApprovalBlock.svelte'
  import { itemHistory } from '../../../../request-resources/itemHistory'
  import { generateIssueShortLink, getIssueIdByIdentifier } from '../../../issues'
  import { canEditIssue } from '../../../utils'
  import tracker from '../../../plugin'
  import IssueStatusActivity from '../IssueStatusActivity.svelte'
  import ControlPanel from './ControlPanel.svelte'
  import StatusEditor from '../StatusEditor.svelte'
  import PriorityEditor from '../PriorityEditor.svelte'
  import AssigneeEditor from '../AssigneeEditor.svelte'
  import DueDateEditor from '../DueDateEditor.svelte'
  import CopyToClipboard from './CopyToClipboard.svelte'
  import SubIssueSelector from './SubIssueSelector.svelte'
  import SubIssues from './SubIssues.svelte'
  import { isWorkflowKind } from '../workflowItem'
  import WorkflowProgress from '../../../workflows/components/WorkflowProgress.svelte'
  import RequestDetails from '../../../forms/components/RequestDetails.svelte'

  export let _id: Ref<Issue> | string
  export let _class: Ref<Class<Issue>>
  export let embedded: boolean = false
  export let readonly: boolean = false

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const issueQuery = createQuery()
  const focusManager = createFocusManager()
  const descriptionKey = {
    key: 'description',
    attr: hierarchy.getAttribute(tracker.class.Issue, 'description')
  }

  let resolvedIssueId: Ref<Issue> | undefined
  let lastViewedIssueId: Ref<Issue> | undefined
  let shownIssue: WithLookup<Issue> | undefined
  let titleText = ''
  let isReadonly = true
  let areAllMixinsShown = false
  let isDescriptionSaved = false
  let panelContent: HTMLElement | undefined
  let panelInnerWidth: number | undefined
  let descriptionEditor: AttachmentStyleBoxCollabEditor | undefined
  let requestDetails: RequestDetails | undefined
  let missingRequestFields: string[] = []

  export function canClose (): boolean {
    return !(descriptionEditor?.isFocused() ?? false)
  }

  $: void resolveIssueId(_id)

  async function resolveIssueId (rawId: Ref<Issue> | string): Promise<void> {
    const identifierMatch = await getIssueIdByIdentifier(rawId)
    if (rawId !== _id) return
    resolvedIssueId = identifierMatch ?? (rawId as Ref<Issue>)
  }

  $: trackViewedIssue(resolvedIssueId)

  function markIssueRead (issueId: Ref<Issue>): void {
    void InboxNotificationsClientImpl.getClient().readDoc(issueId)
  }

  function trackViewedIssue (currentId: Ref<Issue> | undefined): void {
    if (currentId === undefined) return
    if (lastViewedIssueId !== undefined && lastViewedIssueId !== currentId) {
      markIssueRead(lastViewedIssueId)
    }
    lastViewedIssueId = currentId
  }

  onDestroy(() => {
    if (resolvedIssueId !== undefined) markIssueRead(resolvedIssueId)
  })

  $: if (resolvedIssueId !== undefined && _class !== undefined) {
    issueQuery.query(
      _class,
      { _id: resolvedIssueId },
      async (found) => {
        const incoming = found[0]
        if (shownIssue !== undefined && shownIssue._id !== incoming?._id) {
          await saveTitle(shownIssue)
        }
        shownIssue = incoming
        if (incoming !== undefined) titleText = incoming.title
      },
      { limit: 1 }
    )
  }

  $: refreshReadonly(shownIssue, readonly)

  function refreshReadonly (target: Issue | undefined, isReadonlyProp: boolean): void {
    if (target === undefined) {
      isReadonly = isReadonlyProp
      return
    }
    void canEditIssue(target).then((isAllowed) => {
      if (shownIssue === target) isReadonly = isReadonlyProp || !isAllowed
    })
  }

  async function saveTitle (target: Issue | undefined): Promise<void> {
    if (target === undefined || titleText.trim() === '') return
    const singleLineTitle = titleText.replace(/\s*[\r\n]+\s*/g, ' ').trim()
    if (singleLineTitle === '' || singleLineTitle === target.title.trim()) return
    await client.update(target, { title: singleLineTitle })
    Analytics.handleEvent(TrackerEvents.IssueTitleUpdated, { issue: target.identifier ?? target._id })
  }

  function onTitleKeydown (event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) return
    event.preventDefault()
    void saveTitle(shownIssue)
  }

  $: taskType = shownIssue !== undefined ? $taskTypeStore.get(shownIssue.kind) : undefined
  $: projectType = taskType !== undefined ? $typeStore.get(taskType.parent) : undefined
  $: isWorkflowItem = shownIssue !== undefined && isWorkflowKind(shownIssue.kind, $taskTypeStore)
  $: requestHistory = isWorkflowItem && resolvedIssueId !== undefined ? itemHistory(resolvedIssueId) : undefined

  $: hasParent = shownIssue !== undefined && shownIssue.attachedTo !== tracker.ids.NoParent

  async function unsetParent (): Promise<void> {
    if (shownIssue === undefined || readonly) return
    await client.update(shownIssue, { attachedTo: tracker.ids.NoParent })
    Analytics.handleEvent(TrackerEvents.IssueParentUnset, { issue: shownIssue.identifier ?? shownIssue._id })
  }

  async function placeLastUnderNewParent (target: Issue, newParentId: Ref<Issue>): Promise<void> {
    const lastChild = await client.findOne(
      tracker.class.Issue,
      { attachedTo: newParentId },
      { sort: { rank: SortingOrder.Descending } }
    )
    const rank = makeRank(lastChild?.rank, undefined)
    await client.update(target, { attachedTo: newParentId, rank })
  }

  function addParent (): void {
    const target = shownIssue
    if (target === undefined || isReadonly) return
    showPopup(HierarchyAddPopup, { direction: 'parent' }, 'top', (choice: 'create' | 'link' | undefined) => {
      if (choice === 'link') {
        showPopup(SetParentIssueActionPopup, { value: target }, 'top')
      } else if (choice === 'create') {
        showPopup(
          tracker.component.CreateIssue,
          { space: target.space, shouldSaveDraft: true },
          'top',
          async (newParentId: Ref<Issue> | undefined) => {
            if (newParentId !== undefined) await placeLastUnderNewParent(target, newParentId)
          }
        )
      }
    })
  }

  function openContextMenu (event: MouseEvent): void {
    showMenu(event, { object: shownIssue, excludedActions: [view.action.Open] })
  }

  function openClassSettings (event: MouseEvent): void {
    event.stopPropagation()
    const target = getCurrentResolvedLocation()
    target.path[2] = settingId
    target.path[3] = 'setting'
    target.path[4] = 'classes'
    target.path.length = 5
    target.query = { _class }
    target.fragment = undefined
    navigate(target)
  }

  function toggleAllMixins (): void {
    areAllMixinsShown = !areAllMixinsShown
  }

  function findClassFooter (startClassId: Ref<Class<Doc>>) {
    let currentId: Ref<Class<Doc>> | undefined = startClassId
    while (currentId !== undefined) {
      const currentClass = hierarchy.getClass(currentId)
      const footerMixin = hierarchy.as(currentClass, view.mixin.ObjectEditorFooter)
      if (footerMixin.editor !== undefined) return { editor: footerMixin.editor, props: footerMixin.props }
      currentId = currentClass.extends
    }
    return undefined
  }

  $: shownClassId = shownIssue?._class
  $: classFooter = shownClassId !== undefined ? findClassFooter(shownClassId) : undefined

  function focusMissingRequestField (): void {
    requestDetails?.focusMissing()
  }

  $: isEditorContext = ['editor', 'browser'].includes($contextStore.getLastContext()?.mode ?? '')
</script>

{#if !embedded}
  <FocusHandler manager={focusManager} isEnabled={isEditorContext} />
  <ActionContext context={{ mode: 'editor' }} />
{/if}

{#if shownIssue !== undefined}
  <Panel
    object={shownIssue}
    isHeader={false}
    withoutInput={isReadonly}
    allowClose={!embedded}
    isAside={true}
    isSub={false}
    {embedded}
    withoutActivity={false}
    printAside={true}
    adaptive={'default'}
    bind:content={panelContent}
    bind:innerWidth={panelInnerWidth}
    on:open
    on:close={() => dispatch('close')}
    on:select
  >
    <svelte:fragment slot="title">
      {#if !embedded && shownIssue.space && !$deviceOptionsStore.isMobile}
        <ProjectPresenter value={shownIssue.space} openIssues />
        <span class="mx-2 text-foreground">›</span>
      {/if}
      {#if !embedded && hasParent && !$deviceOptionsStore.isMobile}
        <ParentsNavigator element={shownIssue} />
      {/if}
      {#if embedded}
        <DocNavLink noUnderline object={shownIssue}>
          <div class="title">{shownIssue.identifier}</div>
        </DocNavLink>
      {:else}
        <div class="title not-active">{shownIssue.identifier}</div>
      {/if}
      {#if projectType !== undefined && projectType.tasks.length > 1 && taskType !== undefined}
        <span>({taskType.name})</span>
      {/if}
      <ComponentExtensions
        extension={tracker.extensions.EditIssueTitle}
        props={{ size: 'medium', kind: 'ghost', space: shownIssue.space, value: shownIssue, readonly: isReadonly }}
      />
    </svelte:fragment>

    <svelte:fragment slot="pre-utils">
      <ComponentExtensions
        extension={view.extensions.EditDocTitleExtension}
        props={{ size: 'medium', kind: 'ghost', _id, _class, value: shownIssue, readonly: isReadonly }}
      />
      <ComponentExtensions
        extension={tracker.extensions.EditIssueHeader}
        props={{ size: 'medium', kind: 'ghost', space: shownIssue.space, readonly: isReadonly, value: shownIssue }}
      />
      {#if isDescriptionSaved}
        <Label label={presentation.string.Saved} />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="utils">
      {#if !isReadonly}
        <Button
          icon={IconMoreH}
          iconProps={{ size: 'medium' }}
          kind={'icon'}
          showTooltip={{ label: view.string.MoreActions }}
          dataId={'btnMoreActions'}
          on:click={openContextMenu}
        />
        <CopyToClipboard issueUrl={generateIssueShortLink(shownIssue.identifier)} />
        <Button
          icon={setting.icon.Setting}
          kind={'icon'}
          iconProps={{ size: 'medium' }}
          showTooltip={{ label: setting.string.ClassSetting }}
          dataId={'btnClassSetting'}
          on:click={openClassSettings}
        />
      {/if}
      <Button
        icon={IconMixin}
        iconProps={{ size: 'medium' }}
        kind={'icon'}
        selected={areAllMixinsShown}
        dataId={'btnMixin'}
        on:click={toggleAllMixins}
      />
    </svelte:fragment>

    {#if !isWorkflowItem}
      <ApprovalBlock object={shownIssue} />
    {/if}

    {#if hasParent}
      <div class="group mb-6 flex min-w-0 items-center">
        <SubIssueSelector issue={shownIssue} />
        {#if !isReadonly}
          <div class="ml-1 shrink-0 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            <Button
              icon={IconClose}
              iconProps={{ size: 'small' }}
              kind={'ghost'}
              showTooltip={{ label: tracker.string.UnsetParentIssue }}
              dataId={'btnUnsetParent'}
              on:click={unsetParent}
            />
          </div>
        {/if}
      </div>
    {:else if !isReadonly && !isWorkflowItem}
      <div class="mb-6 flex items-center">
        <Button
          icon={tracker.icon.Parent}
          iconProps={{ size: 'medium' }}
          label={tracker.string.AddParentIssue}
          kind={'ghost'}
          dataId={'btnSetParent'}
          on:click={addParent}
        />
      </div>
    {/if}

    <EditBox
      focusIndex={1}
      bind:value={titleText}
      disabled={isReadonly}
      placeholder={tracker.string.IssueTitlePlaceholder}
      kind={'large-style'}
      format={'text-multiline'}
      on:keydown={onTitleKeydown}
      on:blur={() => saveTitle(shownIssue)}
    />

    {#if $deviceOptionsStore.isMobile}
      <div class="mobile-props">
        <StatusEditor value={shownIssue} size={'medium'} iconSize={'small'} shouldShowLabel isEditable={!isReadonly} />
        <PriorityEditor value={shownIssue} size={'medium'} shouldShowLabel isEditable={!isReadonly} />
        <AssigneeEditor object={shownIssue} size={'medium'} avatarSize={'card'} readonly={isReadonly} />
        <DueDateEditor value={shownIssue} editable={!isReadonly} />
      </div>
    {/if}

    {#if isWorkflowItem && projectType !== undefined}
      {#if $requestHistory !== undefined}
        <WorkflowProgress
          issue={shownIssue}
          {projectType}
          history={$requestHistory}
          readonly={isReadonly}
          missing={missingRequestFields}
          on:fill={focusMissingRequestField}
        />
      {/if}
      <RequestDetails
        bind:this={requestDetails}
        bind:missing={missingRequestFields}
        issue={shownIssue}
        readonly={isReadonly}
      />
    {/if}

    <div class="issue-description mt-6 w-full">
      <AttachmentStyleBoxCollabEditor
        focusIndex={30}
        object={shownIssue}
        readonly={isReadonly}
        key={descriptionKey}
        identifier={shownIssue.identifier}
        placeholder={tracker.string.IssueDescriptionPlaceholder}
        boundary={panelContent}
        bind:this={descriptionEditor}
        on:saved={(event) => {
          isDescriptionSaved = event.detail
        }}
      />
    </div>

    <div class="mt-6">
      {#key shownIssue._id}
        <SubIssues focusIndex={50} issue={shownIssue} shouldSaveDraft />
      {/key}
    </div>

    <RelationsEditor object={shownIssue} readonly={isReadonly} />

    {#if classFooter !== undefined}
      <div class="step-tb-6">
        <Component
          is={classFooter.editor}
          props={{ object: shownIssue, _class, ...classFooter.props, readonly: isReadonly }}
        />
      </div>
    {/if}

    <svelte:fragment slot="actions-label">
      <span class="select-text">{shownIssue.identifier}</span>
    </svelte:fragment>

    <svelte:fragment slot="custom-attributes">
      <div class="space-divider"></div>
      <ControlPanel
        issue={shownIssue}
        showAllMixins={areAllMixinsShown}
        {isWorkflowItem}
        readonly={isReadonly}
      />
      <div class="popupPanel-body__aside-grid">
        <div class="divider"></div>
        <IssueStatusActivity issue={shownIssue} />
      </div>
    </svelte:fragment>
  </Panel>
{/if}
