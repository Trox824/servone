<script lang="ts">
  import type { Person } from '@hcengineering/contact'
  import { EmployeeBox, getPersonRefByPersonIdCb } from '@hcengineering/contact-resources'
  import core, { type Class, type Doc, type Mixin, type Ref } from '@hcengineering/core'
  import notification from '@hcengineering/notification'
  import { AttributeBarEditor, createQuery, getClient, type KeyedAttribute } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import type { Issue } from '@hcengineering/tracker'
  import { Component, Label } from '@hcengineering/ui'
  import {
    getDocMixins,
    getFiltredKeys,
    isCollectionAttr,
    ObjectBox,
    restrictionStore
  } from '@hcengineering/view-resources'
  import tracker from '../../../plugin'
  import MilestoneEditor from '../../milestones/MilestoneEditor.svelte'
  import AssigneeEditor from '../AssigneeEditor.svelte'
  import DeadlineEditor from '../DeadlineEditor.svelte'
  import DueDateEditor from '../DueDateEditor.svelte'
  import IssueDependenciesPanel from '../IssueDependenciesPanel.svelte'
  import PriorityEditor from '../PriorityEditor.svelte'
  import RelationEditor from '../RelationEditor.svelte'
  import SchedulingModeEditor from '../SchedulingModeEditor.svelte'
  import StartDateEditor from '../StartDateEditor.svelte'
  import StatusEditor from '../StatusEditor.svelte'

  export let issue: Issue
  export let showAllMixins: boolean = false
  export let readonly: boolean = false
  export let isWorkflowItem: boolean

  const hierarchy = getClient().getHierarchy()

  const DEDICATED_ROW_KEYS = [
    'title',
    'identifier',
    'number',
    'description',
    'status',
    'priority',
    'assignee',
    'component',
    'milestone',
    'startDate',
    'dueDate',
    'schedulingMode',
    'blockedBy',
    'relations'
  ]
  const WORKFLOW_HIDDEN_KEYS = ['estimation', 'reportedTime', 'remainingTime', 'storyPoints']

  interface MixinSection {
    mixin: Mixin<Doc>
    attributes: KeyedAttribute[]
  }

  const blockingQuery = createQuery()
  let blockedIssues: Issue[] = []
  let hasBlockedIssues = false

  $: issueId = issue._id
  $: issueClass = issue._class
  $: blockingQuery.query(
    tracker.class.Issue,
    { blockedBy: { _id: issueId, _class: issueClass } },
    (found) => {
      blockedIssues = found
      hasBlockedIssues = found.length > 0
    }
  )

  let creatorRef: Ref<Person> | undefined
  $: creatorPersonId = issue.createdBy
  $: if (creatorPersonId === undefined) {
    creatorRef = undefined
  } else {
    getPersonRefByPersonIdCb(creatorPersonId, (personRef) => {
      creatorRef = personRef ?? undefined
    })
  }

  function dropWorkflowKeys (attributes: KeyedAttribute[], hideWorkflowKeys: boolean): KeyedAttribute[] {
    return hideWorkflowKeys ? attributes.filter((attribute) => !WORKFLOW_HIDDEN_KEYS.includes(attribute.key)) : attributes
  }

  function listClassAttributes (classId: Ref<Class<Issue>>, hideWorkflowKeys: boolean): KeyedAttribute[] {
    const dedicatedKeys = hideWorkflowKeys ? DEDICATED_ROW_KEYS : [...DEDICATED_ROW_KEYS, 'deadline']
    const ownAttributes = getFiltredKeys(hierarchy, classId, dedicatedKeys).filter(
      (attribute) => !isCollectionAttr(hierarchy, attribute)
    )
    return dropWorkflowKeys(ownAttributes, hideWorkflowKeys)
  }

  function collectMixins (target: Issue, includeAll: boolean): Mixin<Doc>[] {
    const found = getDocMixins(target, includeAll)
    if (found.some((mixin) => mixin._id === notification.mixin.Collaborators)) return found
    return [...found, hierarchy.getClass(notification.mixin.Collaborators) as Mixin<Doc>]
  }

  function listMixinAttributes (mixin: Mixin<Doc>, rootClass: Ref<Class<Issue>>, hideWorkflowKeys: boolean): KeyedAttribute[] {
    const parentId = mixin.extends
    const upperBound = parentId !== undefined && hierarchy.isMixin(parentId) ? parentId : rootClass
    const mixinAttributes = getFiltredKeys(hierarchy, mixin._id, [], upperBound).filter(
      (attribute) => attribute.key === 'collaborators' || !isCollectionAttr(hierarchy, attribute)
    )
    return dropWorkflowKeys(mixinAttributes, hideWorkflowKeys)
  }

  function buildSections (
    mixins: Mixin<Doc>[],
    rootClass: Ref<Class<Issue>>,
    hideWorkflowKeys: boolean
  ): MixinSection[] {
    return mixins
      .map((mixin) => ({ mixin, attributes: listMixinAttributes(mixin, rootClass, hideWorkflowKeys) }))
      .filter((section) => section.attributes.length > 0)
  }

  $: classAttributes = listClassAttributes(issueClass, isWorkflowItem)
  $: mixinSections = buildSections(collectMixins(issue, showAllMixins), issueClass, isWorkflowItem)
</script>

<div class="popupPanel-body__aside-grid">
  {#if issue.template?.template}
    <span class="labelOnPanel"><Label label={tracker.string.IssueTemplate} /></span>
    <ObjectBox
      _class={tracker.class.IssueTemplate}
      allowDeselect
      docProps={{ disabled: true }}
      icon={tracker.icon.Issues}
      kind={'link'}
      label={tracker.string.NoIssueTemplate}
      readonly={true}
      searchField={'title'}
      showNavigate={false}
      size={'small'}
      value={issue.template.template}
      width={'100%'}
    />
  {/if}

  <span class="labelOnPanel"><Label label={tracker.string.Status} /></span>
  <StatusEditor value={issue} size={'medium'} iconSize={'small'} shouldShowLabel isEditable={!readonly} />

  {#if issue.blockedBy && issue.blockedBy.length > 0}
    <span class="labelTop"><Label label={tracker.string.BlockedBy} /></span>
    <RelationEditor value={issue} type="blockedBy" {readonly} disabled={$restrictionStore.disableNavigation} />
  {/if}
  {#if hasBlockedIssues}
    <span class="labelTop"><Label label={tracker.string.Blocks} /></span>
    <RelationEditor
      value={issue}
      type="isBlocking"
      blockedBy={blockedIssues}
      {readonly}
      disabled={$restrictionStore.disableNavigation}
    />
  {/if}
  {#if issue.relations && issue.relations.length > 0}
    <span class="labelTop"><Label label={tracker.string.Related} /></span>
    <RelationEditor value={issue} type="relations" {readonly} disabled={$restrictionStore.disableNavigation} />
  {/if}

  {#if !isWorkflowItem}
    <IssueDependenciesPanel {issue} {readonly} />
  {/if}

  <span class="labelOnPanel"><Label label={tracker.string.Priority} /></span>
  <PriorityEditor value={issue} size={'medium'} shouldShowLabel isEditable={!readonly} width={'100%'} />

  <span class="labelOnPanel"><Label label={core.string.CreatedBy} /></span>
  <EmployeeBox
    avatarSize={'card'}
    kind={'link'}
    label={core.string.CreatedBy}
    readonly={true}
    showNavigate={false}
    size={'medium'}
    value={creatorRef}
    width={'100%'}
  />

  <span class="labelOnPanel"><Label label={tracker.string.Assignee} /></span>
  <AssigneeEditor avatarSize={'card'} object={issue} {readonly} size={'medium'} width={'100%'} />

  <span class="labelTop"><Label label={tracker.string.Labels} /></span>
  <Component
    is={tags.component.TagsAttributeEditor}
    props={{ object: issue, label: tracker.string.AddLabel, readonly }}
  />

  <div class="divider"></div>

  {#if !isWorkflowItem}
    <span class="labelOnPanel"><Label label={tracker.string.Milestone} /></span>
    <MilestoneEditor value={issue} space={issue.space} size={'medium'} isEditable={!readonly} />
    <div class="divider"></div>
    <span class="labelOnPanel"><Label label={tracker.string.IssueStartDate} /></span>
    <StartDateEditor value={issue} width={'100%'} editable={!readonly} />
  {/if}

  <span class="labelOnPanel"><Label label={tracker.string.DueDate} /></span>
  <DueDateEditor value={issue} width={'100%'} editable={!readonly} />

  {#if !isWorkflowItem}
    <span class="labelOnPanel"><Label label={tracker.string.Deadline} /></span>
    <DeadlineEditor value={issue} width={'100%'} editable={!readonly} />
    <span class="labelOnPanel"><Label label={tracker.string.SchedulingMode} /></span>
    <SchedulingModeEditor value={issue} width={'100%'} editable={!readonly} />
  {/if}

  {#if classAttributes.length > 0}
    <div class="divider"></div>
    {#each classAttributes as classAttribute (classAttribute.key)}
      <AttributeBarEditor
        _class={issue._class}
        identifier={issue.identifier}
        key={classAttribute}
        object={issue}
        {readonly}
        showHeader
        size={'medium'}
      />
    {/each}
  {/if}

  {#each mixinSections as section (section.mixin._id)}
    <div class="divider"></div>
    {#each section.attributes as mixinAttribute (mixinAttribute.key)}
      <AttributeBarEditor
        _class={section.mixin._id}
        identifier={issue.identifier}
        key={mixinAttribute}
        object={hierarchy.as(issue, section.mixin._id)}
        {readonly}
        showHeader
        size={'medium'}
      />
    {/each}
  {/each}
</div>
