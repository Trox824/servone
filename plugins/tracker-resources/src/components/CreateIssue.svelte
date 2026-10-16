<!--
// Copyright © 2022 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import activity from '@hcengineering/activity'
  import { Analytics } from '@hcengineering/analytics'
  import { Attachment } from '@hcengineering/attachment'
  import { AttachmentPresenter, AttachmentStyledBox } from '@hcengineering/attachment-resources'
  import { Employee } from '@hcengineering/contact'
  import core, {
    AccountRole,
    Class,
    Doc,
    DocData,
    fillDefaults,
    generateId,
    getCurrentAccount,
    makeCollabId,
    makeDocCollabId,
    type Markup,
    type PersonId,
    Ref,
    SortingOrder,
    toIdMap,
    type TxOperations
  } from '@hcengineering/core'
  import { getEmbeddedLabel, getResource, translate, type Asset, type IntlString, type Resource } from '@hcengineering/platform'
  import preference, { SpacePreference } from '@hcengineering/preference'
  import {
    Card,
    createMarkup,
    createQuery,
    DocCreateExtComponent,
    DocCreateExtensionManager,
    DraftController,
    getClient,
    getMarkup,
    KeyedAttribute,
    MessageBox,
    MultipleDraftController,
    SpaceSelector
  } from '@hcengineering/presentation'
  import tags, { type TagElement, TagReference } from '@hcengineering/tags'
  import { TaskType } from '@hcengineering/task'
  import { TaskKindSelector } from '@hcengineering/task-resources'
  import { EmptyMarkup, isEmptyMarkup } from '@hcengineering/text'
  import {
    Component as ComponentType,
    Issue,
    IssueDraft,
    IssueParentInfo,
    IssuePriority,
    IssueStatus,
    IssueTemplate,
    Milestone,
    Project,
    ProjectTargetPreference,
    TrackerEvents
  } from '@hcengineering/tracker'
  import {
    addNotification,
    Button,
    Component,
    createFocusManager,
    DatePresenter,
    EditBox,
    FocusHandler,
    IconAttachment,
    Label,
    showPopup,
    themeStore,
    type AnyComponent
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { ObjectBox } from '@hcengineering/view-resources'
  import { createEventDispatcher, onDestroy, tick } from 'svelte'

  import { activeComponent, activeMilestone, generateIssueShortLink, updateIssueRelation } from '../issues'
  import tracker from '../plugin'
  import SetParentIssueActionPopup from './SetParentIssueActionPopup.svelte'
  import SubIssues from './SubIssues.svelte'
  import AssigneeEditor from './issues/AssigneeEditor.svelte'
  import IssueNotification from './issues/IssueNotification.svelte'
  import ParentIssue from './issues/ParentIssue.svelte'
  import PriorityEditor from './issues/PriorityEditor.svelte'
  import StatusEditor from './issues/StatusEditor.svelte'
  import EstimationEditor from './issues/timereport/EstimationEditor.svelte'
  import MilestoneSelector from './milestones/MilestoneSelector.svelte'
  import ProjectPresenter from './projects/ProjectPresenter.svelte'

  export let space: Ref<Project> | undefined
  export let status: Ref<IssueStatus> | undefined = undefined
  export let priority: IssuePriority | undefined = undefined
  export let assignee: Ref<Employee> | null = null
  export let component: Ref<ComponentType> | null = null
  export let milestone: Ref<Milestone> | null = null
  export let relatedTo: Doc | undefined
  export let shouldSaveDraft: boolean = true
  export let parentIssue: Issue | undefined
  export let originalIssue: Issue | undefined
  // servone: prefilled by Mail "Create task", chat "Create issue" and /issue new; ignored when a saved draft is restored.
  export let initialTitle: string = ''
  export let initialDescription: Markup = EmptyMarkup
  export let servoneSource: { author: string, text: string } | undefined = undefined

  const mDraftController = new MultipleDraftController(tracker.ids.IssueDraft)
  // Stored across the function/dispatch boundary so the success-path close
  // (fired by Card after okAction resolves) can forward the new issue's id
  // to the showPopup callback. Stays undefined on cancel → existing callers
  // see no behavior change.
  let createdIssueId: Ref<Issue> | undefined
  const id: Ref<Issue> = generateId()
  const draftController = new DraftController<IssueDraft>(
    shouldSaveDraft ? (mDraftController.getNext() ?? id) : undefined,
    tracker.ids.IssueDraft
  )

  let draft = shouldSaveDraft ? draftController.get() : undefined

  onDestroy(
    draftController.subscribe((val) => {
      draft = shouldSaveDraft ? val : undefined
    })
  )
  const me = getCurrentAccount()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const parentQuery = createQuery()

  let _space = draft?.space ?? space
  // let project: Project | undefined
  let object = getDefaultObjectFromDraft() ?? getDefaultObject(id)
  let isAssigneeTouched = false
  let kind: Ref<TaskType> | undefined = undefined

  let templateId: Ref<IssueTemplate> | undefined = draft?.template?.template
  let appliedTemplateId: Ref<IssueTemplate> | undefined = draft?.template?.template

  let template: IssueTemplate | undefined = undefined
  const templateQuery = createQuery()

  function objectChange (object: IssueDraft, empty: any): void {
    if (shouldSaveDraft) {
      draftController.save(object, empty)
    }
  }

  $: if (object.parentIssue !== undefined) {
    parentQuery.query(
      tracker.class.Issue,
      {
        _id: object.parentIssue
      },
      (res) => {
        ;[parentIssue] = res
      }
    )
  } else {
    parentQuery.unsubscribe()
    parentIssue = undefined
  }

  function getDefaultObjectFromDraft (): IssueDraft | undefined {
    if (draft == null) {
      return
    }

    const _parentIssue = parentIssue
    return {
      ...draft,
      ...(status != null ? { status } : {}),
      ...(priority != null ? { priority } : {}),
      ...(assignee != null ? { assignee } : {}),
      ...(component != null ? { component } : {}),
      ...(milestone != null ? { milestone } : {}),
      ...(_parentIssue !== undefined ? { parentIssue: _parentIssue._id } : {})
    }
  }

  function getDefaultObject (id: Ref<Issue> | undefined = undefined, ignoreOriginal = false): IssueDraft {
    const base: IssueDraft = {
      _id: id ?? generateId(),
      title: initialTitle,
      description: initialDescription,
      kind: '' as Ref<TaskType>,
      priority: priority ?? IssuePriority.NoPriority,
      space: _space as Ref<Project>,
      component: component ?? $activeComponent ?? null,
      startDate: null,
      dueDate: null,
      attachments: 0,
      estimation: 0,
      milestone: milestone ?? $activeMilestone ?? null,
      status,
      assignee,
      labels: [],
      parentIssue: parentIssue?._id,
      subIssues: []
    }
    if (originalIssue !== undefined && !ignoreOriginal) {
      const res: IssueDraft = {
        ...base,
        status: originalIssue.status,
        priority: originalIssue.priority,
        component: originalIssue.component,
        dueDate: originalIssue.dueDate,
        assignee: originalIssue.assignee,
        estimation: originalIssue.estimation,
        parentIssue: originalIssue.parents[0]?.parentId,
        title: `${originalIssue.title} (copy)`
      }
      void getMarkup(makeDocCollabId(originalIssue, 'description'), originalIssue.description).then((res) => {
        object.description = res
      })
      void client.findAll(tags.class.TagReference, { attachedTo: originalIssue._id }).then((p) => {
        object.labels = p
      })
      if (originalIssue.relations?.[0] !== undefined) {
        void client.findOne(tracker.class.Issue, { _id: originalIssue.relations[0]._id as Ref<Issue> }).then((p) => {
          relatedTo = p
        })
      }

      return res
    }
    return base
  }
  fillDefaults(hierarchy, object, tracker.class.Issue)

  // servone: set in the project's Create form tab (packages/servone-ui .../settings/ProjectCreateForm.svelte).
  let currentProject: (Project & { servoneDefaultTemplate?: Ref<IssueTemplate> | null }) | undefined

  // servone: the project's default template is applied and locked; switching away drops only a locked one.
  let servoneLockedTemplate: Ref<IssueTemplate> | undefined
  // servone: the form as the locked template left it, so closing it untouched neither prompts nor keeps a draft.
  let servoneLockedDefaults: Partial<IssueDraft> = {}
  $: servoneLockTemplate(currentProject?.servoneDefaultTemplate ?? undefined)
  function servoneLockTemplate (next: Ref<IssueTemplate> | undefined): void {
    if (next !== undefined) templateId = next
    else if (servoneLockedTemplate !== undefined && templateId === servoneLockedTemplate) {
      templateId = undefined
      object.template = undefined
      servoneLockedDefaults = {}
    }
    servoneLockedTemplate = next
  }

  // servone: a Quy trình workflow project creates business items; packages/servone-ui .../workflows/nav.ts.
  const servoneIsWorkflowType = 'servone-tracker:function:IsWorkflowType' as Resource<(type: string) => boolean>
  const servoneItemString = (key: 'NewItem' | 'CreateItem' | 'ItemCreated' | 'ItemTitle' | 'Workflow'): IntlString =>
    `servone-tracker:string:${key}` as IntlString
  const servoneWorkflowIcon = 'servone-workflow:icon:workflow' as Asset
  async function servoneIsWorkflowProject (project: Project | undefined): Promise<boolean> {
    return project !== undefined && (await getResource(servoneIsWorkflowType))(project.type)
  }
  let servoneIsWorkflow = false
  $: void servoneIsWorkflowProject(currentProject).then((isWorkflow) => {
    servoneIsWorkflow = isWorkflow
  })
  $: servoneWorkflowsOnly = servoneIsWorkflow && relatedTo === undefined
  async function servoneFindDefaultSpace (): Promise<Project | undefined> {
    const project = await findDefaultSpace()
    return relatedTo !== undefined && (await servoneIsWorkflowProject(project)) ? undefined : project
  }

  let descriptionBox: AttachmentStyledBox | undefined

  $: updateIssueStatusId(object, currentProject)
  $: updateAssigneeId(object, currentProject)
  $: canSave =
    descriptionBox != null &&
    getTitle(object.title ?? '').length > 0 &&
    object.status !== undefined &&
    kind !== undefined &&
    currentProject !== undefined &&
    // servone: a template form with unanswered required questions blocks Create.
    servoneForm?.isComplete !== false

  $: empty = {
    assignee: assignee ?? currentProject?.defaultAssignee,
    status: status ?? currentProject?.defaultIssueStatus,
    parentIssue: parentIssue?._id,
    description: EmptyMarkup,
    component: component ?? $activeComponent ?? null,
    milestone: milestone ?? $activeMilestone ?? null,
    priority: priority ?? IssuePriority.NoPriority,
    space: _space,
    ...servoneLockedDefaults
  }

  $: objectChange(object, empty)

  $: if (_space !== undefined && object.space !== _space) {
    object.space = _space
  }

  function resetObject (): void {
    templateId = undefined
    template = undefined
    object = getDefaultObject(undefined, true)
    fillDefaults(hierarchy, object, tracker.class.Issue)
  }

  $: if (templateId !== undefined) {
    templateQuery.query(tracker.class.IssueTemplate, { _id: templateId }, (res) => {
      template = res[0]
    })
  } else {
    template = undefined
    templateQuery.unsubscribe()
  }

  function tagAsRef (tag: TagElement): TagReference {
    return {
      _class: tags.class.TagReference,
      _id: generateId(),
      attachedTo: '' as Ref<Doc>,
      attachedToClass: tracker.class.Issue,
      collection: 'labels',
      space: core.space.Workspace,
      modifiedOn: 0,
      modifiedBy: '' as PersonId,
      title: tag.title,
      tag: tag._id,
      color: tag.color
    }
  }

  async function updateTemplate (template: IssueTemplate): Promise<void> {
    if (object.template?.template === template._id) {
      return
    }
    const { _class, _id, space, children, comments, attachments, labels, description, ...templBase } = template

    const allLabels = new Set<Ref<TagElement>>()
    for (const label of labels ?? []) {
      allLabels.add(label)
    }
    for (const child of children) {
      for (const label of child.labels ?? []) {
        allLabels.add(label)
      }
    }
    const tagElements = toIdMap(await client.findAll(tags.class.TagElement, { _id: { $in: Array.from(allLabels) } }))
    // servone: a workflow template's title is its name ("Hiring"), not a title for the new item.
    const servoneKeepTitle = await servoneIsWorkflowProject(currentProject)

    object.subIssues = template.children.map((p) => {
      return {
        ...p,
        kind: p.kind ?? kind ?? ('' as Ref<TaskType>),
        _id: generateId(),
        space: _space as Ref<Project>,
        subIssues: [],
        startDate: null,
        dueDate: null,
        labels:
          p.labels !== undefined
            ? p.labels
              .map((p) => {
                const val = tagElements.get(p)
                return val !== undefined ? tagAsRef(val) : undefined
              })
              .filter((p) => p !== undefined)
            : [],
        status: currentProject?.defaultIssueStatus
      }
    })

    object = {
      ...object,
      description: description == null || isEmptyMarkup(description) ? object.description : description,
      ...templBase,
      title: servoneKeepTitle ? object.title : templBase.title,
      template: {
        template: template._id
      }
    }
    appliedTemplateId = templateId
    object.labels =
      labels !== undefined
        ? labels
          .map((p) => {
            const val = tagElements.get(p)
            return val !== undefined ? tagAsRef(val) : undefined
          })
          .filter((p) => p !== undefined)
        : []

    if (object.kind !== undefined) {
      kind = object.kind
    }
    fillDefaults(hierarchy, object, tracker.class.Issue)
    if (template._id === servoneLockedTemplate) {
      // Status and assignee defaults land in the next reactive flush.
      await tick()
      servoneLockedDefaults = structuredClone(object)
    }
  }

  $: if (template !== undefined) {
    void updateTemplate(template)
  }

  const dispatch = createEventDispatcher()
  const spaceQuery = createQuery()

  const key: KeyedAttribute = {
    key: 'labels',
    attr: client.getHierarchy().getAttribute(tracker.class.Issue, 'labels')
  }

  $: if (_space !== undefined) {
    spaceQuery.query(tracker.class.Project, { _id: _space, members: getCurrentAccount().uuid }, (res) => {
      resetDefaultAssigneeId()
      currentProject = res[0]
    })
  } else {
    currentProject = undefined
  }

  const docCreateManager = DocCreateExtensionManager.create(tracker.class.Issue)

  function updateIssueStatusId (object: IssueDraft, currentProject: Project | undefined): void {
    if (currentProject?.defaultIssueStatus !== undefined && object.status === undefined) {
      object.status = currentProject.defaultIssueStatus
    }
  }

  function resetDefaultAssigneeId (): void {
    if (!isAssigneeTouched && !(object.assignee == null) && object.assignee === currentProject?.defaultAssignee) {
      object = { ...object, assignee: assignee ?? null }
    }
  }

  function updateAssigneeId (object: IssueDraft, currentProject: Project | undefined): void {
    if (!isAssigneeTouched && object.assignee == null && currentProject !== undefined) {
      if (currentProject.defaultAssignee !== undefined) {
        object.assignee = currentProject.defaultAssignee
      } else {
        object.assignee = null
      }
    }
  }
  function clearParentIssue (): void {
    object.parentIssue = undefined
    parentQuery.unsubscribe()
    parentIssue = undefined
  }

  function getTitle (value: string): string {
    return value.trim()
  }

  let subIssuesComponent: SubIssues

  // servone: Escape asks before discarding, like the X button; an overlay click keeps upstream's save-and-close.
  let isClosingFromOutside = false
  export function canClose (): boolean {
    if (isClosingFromOutside) return true
    void showConfirmationDialog()
    return false
  }

  export function onOutsideClick (): void {
    isClosingFromOutside = true
    if (shouldSaveDraft) {
      draftController.save(object, empty)
    }
  }

  const projectPreferences = createQuery()
  let preferences: ProjectTargetPreference[] = []
  $: projectPreferences.query(tracker.class.ProjectTargetPreference, {}, (res) => {
    preferences = res
  })

  async function updateCurrentProjectPref (currentProject: Ref<Project>): Promise<void> {
    if (me?.role === AccountRole.ReadOnlyGuest || me?.role === AccountRole.Guest) return
    const spacePreferences = await client.findOne(tracker.class.ProjectTargetPreference, { attachedTo: currentProject })
    if (spacePreferences === undefined) {
      await client.createDoc(tracker.class.ProjectTargetPreference, currentProject, {
        attachedTo: currentProject,
        props: [],
        usedOn: Date.now()
      })
    } else {
      if (spacePreferences.usedOn + 60 * 1000 < Date.now()) {
        await client.update(spacePreferences, {
          usedOn: Date.now()
        })
      }
    }
  }

  $: if (_space !== undefined) {
    void updateCurrentProjectPref(_space)
  }

  // servone: Scrum story points; editor and writer are in packages/servone-ui/src/plugins/tracker-resources/sprints.
  const servonePointsEditor = 'servone-tracker:component:CreateIssuePoints' as AnyComponent
  const servoneSetIssuePoints = 'servone-tracker:function:SetIssuePoints' as Resource<
  (ops: TxOperations, issue: Ref<Issue>, space: Ref<Project>, points: number) => Promise<void>
  >
  let servonePoints: number | null = null
  // servone: questions of a form template; packages/servone-ui/src/plugins/tracker-resources/forms.
  const servoneFormEditor = 'servone-tracker:component:CreateIssueForm' as AnyComponent
  let servoneForm:
  | {
    isComplete: boolean
    hasAnswers: boolean
    titleLabel: string | undefined
    missingHint: string | undefined
    fill: (value: DocData<Issue>, description: Markup) => Markup
    save: (ops: TxOperations, issue: Ref<Issue>, space: Ref<Project>) => Promise<void>
  }
  | undefined

  async function createIssue (): Promise<void> {
    const _id: Ref<Issue> = generateId()
    if (
      !canSave ||
      object.status === undefined ||
      _space === undefined ||
      kind === undefined ||
      currentProject === undefined
    ) {
      return
    }

    // TODO: We need a measure client and mark all operations with it as measure under one root,
    // to prevent other operations to infer our measurement.
    try {
      const operations = client.apply(undefined, 'tracker.createIssue')

      const incResult = await client.updateDoc(
        tracker.class.Project,
        core.space.Space,
        _space,
        {
          $inc: { sequence: 1 }
        },
        true
      )

      const number = (incResult as any).object.sequence

      const identifier = `${currentProject?.identifier}-${number}`

      const value: DocData<Issue> = {
        title: getTitle(object.title),
        description: null,
        assignee: object.assignee,
        component: object.component,
        milestone: object.milestone,
        number,
        status: object.status,
        priority: object.priority,
        rank: '',
        comments: 0,
        subIssues: 0,
        startDate: object.startDate,
        dueDate: object.dueDate,
        parents:
          parentIssue != null
            ? [
                {
                  parentId: parentIssue._id,
                  parentTitle: parentIssue.title,
                  space: parentIssue.space,
                  identifier: parentIssue.identifier
                },
                ...parentIssue.parents
              ]
            : [],
        reportedTime: 0,
        remainingTime: 0,
        estimation: object.estimation,
        reports: 0,
        relations: relatedTo !== undefined ? [{ _id: relatedTo._id, _class: relatedTo._class }] : [],
        childInfo: [],
        kind,
        identifier
      }

      // servone: form answers may set priority and due date on `value` and extend the description.
      const description = servoneForm?.fill(value, object.description) ?? object.description
      if (!isEmptyMarkup(description)) {
        const collabId = makeCollabId(tracker.class.Issue, _id, 'description')
        value.description = await createMarkup(collabId, description)
      }

      await docCreateManager.commit(operations, _id, currentProject, value, 'pre')

      await operations.addCollection(
        tracker.class.Issue,
        _space,
        parentIssue?._id ?? tracker.ids.NoParent,
        parentIssue?._class ?? tracker.class.Issue,
        'subIssues',
        value,
        _id
      )
      await docCreateManager.commit(operations, _id, currentProject, value, 'post')
      if (servonePoints !== null) {
        const setIssuePoints = await getResource(servoneSetIssuePoints)
        await setIssuePoints(operations, _id, _space, servonePoints)
      }
      if (servoneForm !== undefined) {
        await servoneForm.save(operations, _id, _space)
      }
      for (const label of object.labels) {
        await operations.addCollection(label._class, label.space, _id, tracker.class.Issue, 'labels', {
          title: label.title,
          color: label.color,
          tag: label.tag
        })
      }

      if (relatedTo !== undefined) {
        const doc = await client.findOne(tracker.class.Issue, { _id })
        if (doc !== undefined) {
          if (client.getHierarchy().isDerived(relatedTo._class, tracker.class.Issue)) {
            await updateIssueRelation(operations, relatedTo as Issue, doc, 'relations', '$push')
          } else {
            const update = await getResource(activity.backreference.Update)
            await update(doc, 'relations', [relatedTo], tracker.string.AddedReference)
          }
        }
      }

      await descriptionBox?.createAttachments(_id, operations)
      const result = await operations.commit()

      const parents: IssueParentInfo[] =
        parentIssue != null
          ? [
              { parentId: _id, parentTitle: value.title, space: parentIssue.space, identifier },
              {
                parentId: parentIssue._id,
                parentTitle: parentIssue.title,
                space: parentIssue.space,
                identifier: parentIssue.identifier
              },
              ...parentIssue.parents
            ]
          : [{ parentId: _id, parentTitle: value.title, space: _space, identifier }]
      await subIssuesComponent.save(parents, _id)
      addNotification(
        await translate(
          servoneIsWorkflow ? servoneItemString('ItemCreated') : tracker.string.IssueCreated,
          {},
          $themeStore.language
        ),
        getTitle(object.title),
        IssueNotification,
        {
          issueId: _id,
          subTitlePostfix: (await translate(tracker.string.CreatedOne, {}, $themeStore.language)).toLowerCase(),
          issueUrl: currentProject != null && generateIssueShortLink(value.identifier)
        }
      )

      draftController.remove()
      descriptionBox?.removeDraft(false)
      isAssigneeTouched = false
      const d1 = Date.now()
      const analyticsProps = await docCreateManager.getAnalyticsProps(currentProject, value)
      Analytics.handleEvent(TrackerEvents.IssueCreated, {
        ok: true,
        id: value.identifier,
        project: currentProject.identifier,
        ...analyticsProps
      })
      console.log('createIssue measure', result, Date.now() - d1)
      // Surface the new issue's id so popup callers can wire follow-up
      // edits (e.g. "Create new parent" needs to set the calling issue's
      // attachedTo to this newly-created issue's _id). The Card's
      // okAction-success path will dispatch 'close' shortly; our on:close
      // handler reads this variable as the close payload.
      createdIssueId = _id
    } catch (err: any) {
      resetObject()
      draftController.remove()
      descriptionBox?.removeDraft(false)
      console.error(err)
      Analytics.handleEvent(TrackerEvents.IssueCreated, { ok: false, project: currentProject.identifier })
      Analytics.handleError(err)
    }
  }

  async function setParentIssue (): Promise<void> {
    showPopup(
      SetParentIssueActionPopup,
      { value: { ...object, space: _space, attachedTo: parentIssue?._id } },
      'top',
      (selectedIssue) => {
        if (selectedIssue !== undefined) {
          parentIssue = selectedIssue
          object.parentIssue = parentIssue?._id
        }
      }
    )
  }

  const handleMilestoneIdChanged = (milestoneId: Ref<Milestone> | null | undefined): void => {
    if (milestoneId === undefined) {
      return
    }

    object.milestone = milestoneId
  }

  function addTagRef (tag: TagElement): void {
    object.labels = [...object.labels, tagAsRef(tag)]
  }
  function handleTemplateChange (evt: CustomEvent<Ref<IssueTemplate>>): void {
    if (templateId == null) {
      templateId = evt.detail
      return
    }
    // Template is already specified, ask to replace.
    showPopup(
      MessageBox,
      {
        label: tracker.string.TemplateReplace,
        message: tracker.string.TemplateReplaceConfirm,
        okLabel: tracker.string.Apply
      },
      'top',
      (result?: boolean) => {
        if (result === true) {
          templateId = evt.detail ?? undefined

          if (templateId === undefined) {
            object.subIssues = []
            resetObject()
          }
        }
      }
    )
  }

  async function showConfirmationDialog (): Promise<void> {
    draftController.save(object, empty)
    // servone: form answers live outside the draft.
    const isFormEmpty = draft === undefined && servoneForm?.hasAnswers !== true

    if (isFormEmpty) {
      dispatch('close')
    } else {
      showPopup(
        MessageBox,
        {
          label: tracker.string.NewIssueDialogClose,
          message: tracker.string.NewIssueDialogCloseNote
        },
        'top',
        (result?: boolean) => {
          if (result === true) {
            dispatch('close')
            resetObject()
            draftController.remove()
            descriptionBox?.removeDraft(true)
          }
        }
      )
    }
  }

  $: objectId = object._id
  const manager = createFocusManager()

  let attachments: Map<Ref<Attachment>, Attachment> = new Map<Ref<Attachment>, Attachment>()

  function isMemberOfProject (project: Project | undefined): boolean {
    if (project == null) return false
    const members = project.members
    if (!Array.isArray(members)) return true
    return members.includes(me.uuid)
  }

  async function findDefaultSpace (): Promise<Project | undefined> {
    let targetRef: Ref<Project> | undefined
    if (relatedTo !== undefined) {
      const targets = await client.findAll(tracker.class.RelatedIssueTarget, {})
      // Find a space target first
      targetRef =
        targets.find((t) => t.rule.kind === 'spaceRule' && t.rule.space === relatedTo?.space && t.target !== undefined)
          ?.target ?? undefined
      // Find a class target as second
      targetRef =
        targetRef ??
        targets.find(
          (t) =>
            t.rule.kind === 'classRule' &&
            client.getHierarchy().isDerived(relatedTo?._class as Ref<Class<Doc>>, t.rule.ofClass)
        )?.target ??
        undefined
    }

    if (targetRef === undefined) {
      // Use last created issue in first.
      const projects = await client.findAll(
        tracker.class.ProjectTargetPreference,
        {},
        { sort: { usedOn: SortingOrder.Descending } }
      )
      if (projects.length > 0) {
        targetRef = projects[0]?.attachedTo
      }
    }

    // Find first starred project
    if (targetRef === undefined) {
      const prefs = await client.findAll<SpacePreference>(
        preference.class.SpacePreference,
        {},
        { sort: { modifiedOn: SortingOrder.Ascending } }
      )
      const projects = await client.findAll<Project>(tracker.class.Project, {
        _id: {
          $in: Array.from(prefs.map((it) => it.attachedTo as Ref<Project>).filter((it) => it != null))
        }
      })
      if (projects.length > 0) {
        const candidate = projects[0]
        return isMemberOfProject(candidate) ? candidate : undefined
      }
    }

    if (targetRef !== undefined) {
      const candidate = await client.findOne(tracker.class.Project, { _id: targetRef })
      return isMemberOfProject(candidate) ? candidate : undefined
    }
  }

  $: extraProps = {
    status: object.status,
    priority: object.priority,
    assignee: object.assignee,
    component: object.component,
    milestone: object.milestone,
    relatedTo,
    parentIssue,
    originalIssue,
    preferences
  }
</script>

<FocusHandler {manager} />

<Card
  label={servoneIsWorkflow ? servoneItemString('NewItem') : tracker.string.NewIssue}
  okAction={createIssue}
  {canSave}
  okLabel={servoneIsWorkflow ? servoneItemString('CreateItem') : tracker.string.SaveIssue}
  on:close={() => dispatch('close', createdIssueId)}
  onCancel={showConfirmationDialog}
  hideAttachments={attachments.size === 0}
  hideSubheader={parentIssue == null && servoneSource === undefined}
  headerNoPadding
  noFade={true}
  on:changeContent
>
  <svelte:fragment slot="header">
    <SpaceSelector
      _class={tracker.class.Project}
      query={servoneWorkflowsOnly
        ? {
            archived: false,
            members: getCurrentAccount().uuid,
            // servone: matches the base type and its per-project copies, as IsWorkflowType does.
            type: { $like: 'servone:projectType:Workflow%' }
          }
        : {
            archived: false,
            members: getCurrentAccount().uuid
          }}
      label={servoneWorkflowsOnly ? servoneItemString('Workflow') : tracker.string.Project}
      bind:space={_space}
      on:object={(evt) => {
        currentProject = evt.detail ?? undefined
      }}
      kind={'regular'}
      size={'small'}
      component={ProjectPresenter}
      defaultIcon={servoneWorkflowsOnly ? servoneWorkflowIcon : tracker.icon.Home}
      clearInvalidValue={true}
      findDefaultSpace={servoneFindDefaultSpace}
    />
    {#if servoneIsWorkflow && servoneLockedTemplate !== undefined}
      <!-- servone: a locked template can't be changed here, so it reads as text, not a dead chip. -->
      <span class="servone-fixed-template flex-row-center">
        <span class="servone-caption"><Label label={tracker.string.IssueTemplate} /></span>
        <span class="overflow-label">{template?.title ?? ''}</span>
      </span>
    {:else}
      <ObjectBox
        _class={tracker.class.IssueTemplate}
        value={templateId}
        docQuery={{
          space: _space
        }}
        on:change={handleTemplateChange}
        kind={'regular'}
        size={'small'}
        label={tracker.string.NoIssueTemplate}
        icon={tracker.icon.IssueTemplates}
        searchField={'title'}
        allowDeselect={true}
        showNavigate={false}
        docProps={{ disabled: true, noUnderline: true }}
        readonly={servoneLockedTemplate !== undefined}
        focusIndex={20000}
      />
    {/if}
    <DocCreateExtComponent manager={docCreateManager} kind={'header'} space={currentProject} props={extraProps} />
  </svelte:fragment>
  <svelte:fragment slot="title" let:label>
    <div class="flex-row-center gap-2 pt-1 pb-1 pr-1">
      <span class="overflow-label">
        <Label {label} />
      </span>
      <TaskKindSelector
        projectType={currentProject?.type}
        bind:value={kind}
        baseClass={tracker.class.Issue}
        size={'small'}
      />
      {#if relatedTo && !client.getHierarchy().isDerived(relatedTo._class, activity.class.ActivityMessage)}
        <div class="lower mr-2">
          <Label label={tracker.string.RelatedTo} />
        </div>
        <Component
          is={view.component.ObjectPresenter}
          props={{
            value: relatedTo,
            _class: relatedTo._class,
            objectId: relatedTo._id,
            inline: true,
            shouldShowAvatar: false,
            noUnderline: true
          }}
        />
      {/if}
      <DocCreateExtComponent manager={docCreateManager} kind={'title'} space={currentProject} props={extraProps} />
    </div>
  </svelte:fragment>
  <svelte:fragment slot="subheader">
    {#if parentIssue}
      <ParentIssue issue={parentIssue} on:close={clearParentIssue} />
    {/if}
    {#if servoneSource !== undefined}
      <div class="servone-source">
        <span class="servone-source-author">{servoneSource.author}</span>
        <span class="overflow-label">{servoneSource.text}</span>
      </div>
    {/if}
  </svelte:fragment>
  <div id="issue-name" class="m-3 clear-mins">
    <EditBox
      focusIndex={1}
      bind:value={object.title}
      placeholder={servoneForm?.titleLabel !== undefined
        ? getEmbeddedLabel(servoneForm.titleLabel)
        : servoneIsWorkflow
          ? servoneItemString('ItemTitle')
          : tracker.string.IssueTitlePlaceholder}
      kind={'large-style'}
      autoFocus
      fullSize
    />
  </div>
  <div id="issue-description">
    {#key [objectId, appliedTemplateId]}
      <AttachmentStyledBox
        bind:this={descriptionBox}
        focusIndex={2}
        objectId={object._id}
        {shouldSaveDraft}
        _class={tracker.class.Issue}
        space={_space}
        alwaysEdit
        showButtons={false}
        kind={'indented'}
        isScrollable={false}
        kitOptions={{ reference: true }}
        enableAttachments={false}
        bind:content={object.description}
        placeholder={tracker.string.IssueDescriptionPlaceholder}
        on:changeSize={() => dispatch('changeContent')}
        on:attach={(ev) => {
          if (ev.detail.action === 'saved') {
            object.attachments = ev.detail.value
          }
        }}
        on:attachments={(ev) => {
          if (ev.detail.size > 0) attachments = ev.detail.values
          else if (ev.detail.size === 0 && ev.detail.values != null) {
            attachments.clear()
            attachments = attachments
          }
        }}
      />
    {/key}
  </div>
  <Component
    is={servoneFormEditor}
    showLoading={false}
    props={{ template }}
    on:change={(ev) => {
      servoneForm = ev.detail ?? undefined
    }}
  />
  {#if _space}
    <SubIssues
      bind:this={subIssuesComponent}
      projectId={_space}
      project={currentProject}
      milestone={object.milestone}
      component={object.component}
      bind:subIssues={object.subIssues}
    />
  {/if}
  <DocCreateExtComponent manager={docCreateManager} kind={'body'} space={currentProject} props={extraProps} />
  <svelte:fragment slot="pool">
    <div id="status-editor" class:servone-captioned={servoneIsWorkflow}>
      {#if kind !== undefined}
        <!-- servone: a status name alone ("New") reads like a title. -->
        {#if servoneIsWorkflow}
          <span class="servone-caption"><Label label={tracker.string.Status} /></span>
        {/if}
        <StatusEditor
          focusIndex={3}
          value={{ ...object, kind }}
          kind={'regular'}
          size={'large'}
          defaultIssueStatus={currentProject?.defaultIssueStatus}
          shouldShowLabel={true}
          short
          on:refocus={() => {
            manager.setFocusPos(3)
          }}
          on:change={({ detail }) => {
            if (object.status !== detail) {
              object.status = detail
            }
          }}
        />
      {/if}
    </div>
    <div id="priority-editor">
      <PriorityEditor
        focusIndex={4}
        value={object}
        shouldShowLabel
        isEditable
        kind={'regular'}
        size={'large'}
        justify="center"
        on:change={({ detail }) => {
          object.priority = detail
          manager.setFocusPos(4)
        }}
      />
    </div>
    <div id="assignee-editor">
      <AssigneeEditor
        focusIndex={5}
        {object}
        kind={'regular'}
        size={'large'}
        short
        on:change={({ detail }) => {
          isAssigneeTouched = true
          object.assignee = detail
          manager.setFocusPos(5)
        }}
      />
    </div>
    <Component
      is={tags.component.TagsDropdownEditor}
      props={{
        focusIndex: 6,
        items: object.labels,
        key,
        targetClass: tracker.class.Issue,
        countLabel: tracker.string.NumberLabels,
        kind: 'regular',
        size: 'large'
      }}
      on:open={(evt) => {
        addTagRef(evt.detail)
      }}
      on:delete={(evt) => {
        object.labels = object.labels.filter((it) => it.tag !== evt.detail._id)
      }}
    />
    {#if !servoneIsWorkflow}
      <div id="estimation-editor" class="new-line">
        <EstimationEditor focusIndex={8} kind={'regular'} size={'large'} value={object} />
      </div>
    {/if}
    <Component
      is={servonePointsEditor}
      showLoading={false}
      props={{ project: currentProject, points: servonePoints }}
      on:change={(ev) => {
        servonePoints = ev.detail
      }}
    />
    {#if !servoneIsWorkflow}
      <div id="milestone-editor" class="new-line">
        <MilestoneSelector
          focusIndex={9}
          value={object.milestone}
          space={_space}
          onChange={handleMilestoneIdChanged}
          kind={'regular'}
          size={'large'}
          short
        />
      </div>
    {/if}
    <!-- servone: with the tracker-only second-row fields hidden, due date would sit alone on that row. -->
    <div id="duedate-editor" class:new-line={!servoneIsWorkflow}>
      <DatePresenter
        focusIndex={10}
        bind:value={object.dueDate}
        labelNull={tracker.string.DueDate}
        kind={'regular'}
        size={'large'}
        editable
      />
    </div>
    {#if !servoneIsWorkflow}
      <div id="parentissue-editor" class="new-line">
        <Button
          focusIndex={11}
          icon={tracker.icon.Parent}
          label={object.parentIssue != null ? tracker.string.RemoveParent : tracker.string.SetParent}
          kind={'regular'}
          size={'large'}
          notSelected={object.parentIssue === undefined}
          on:click={object.parentIssue != null ? clearParentIssue : setParentIssue}
        />
      </div>
    {/if}
    <DocCreateExtComponent manager={docCreateManager} kind={'pool'} space={currentProject} props={extraProps} />
  </svelte:fragment>
  <svelte:fragment slot="attachments">
    {#if attachments.size > 0}
      {#each Array.from(attachments.values()) as attachment}
        <AttachmentPresenter
          value={attachment}
          showPreview
          removable
          on:remove={(result) => {
            if (result.detail !== undefined) descriptionBox?.removeAttachmentById(result.detail._id)
          }}
        />
      {/each}
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="footer">
    <Button
      focusIndex={12}
      icon={IconAttachment}
      iconProps={{ fill: 'var(--theme-dark-color)' }}
      size={'large'}
      kind={'ghost'}
      on:click={() => {
        descriptionBox?.handleAttach()
      }}
    />
    <DocCreateExtComponent manager={docCreateManager} kind={'footer'} space={currentProject} props={extraProps} />
  </svelte:fragment>
  <svelte:fragment slot="buttons">
    <DocCreateExtComponent manager={docCreateManager} kind={'buttons'} space={currentProject} props={extraProps} />
  </svelte:fragment>
  <svelte:fragment slot="after-buttons" let:handleOkClick let:okProcessing let:focusIndex let:canSave let:okLabel>
    <!-- servone: says why Create is disabled while required form questions are empty. -->
    {#if servoneForm?.missingHint !== undefined}
      <span class="servone-caption">{servoneForm.missingHint}</span>
    {/if}
    <DocCreateExtComponent
      manager={docCreateManager}
      kind={'createButton'}
      space={currentProject}
      props={{
        ...extraProps,
        handleOkClick,
        okProcessing,
        focusIndex,
        canSave,
        okLabel
      }}
    >
      <Button
        loading={okProcessing}
        focusIndex={10001}
        disabled={canSave !== true}
        label={okLabel}
        kind={'primary'}
        size={'large'}
        on:click={handleOkClick}
      />
    </DocCreateExtComponent>
  </svelte:fragment>
</Card>

<style lang="scss">
  // servone: the description editor's hover "+" block menu drifts below the field here; "/" offers the same inserts.
  #issue-description :global(.tiptap-left-menu) {
    display: none;
  }
  .servone-captioned {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .servone-fixed-template {
    gap: 0.375rem;
    min-width: 0;
    font-size: 0.8125rem;
    color: var(--theme-caption-color);
  }
  .servone-caption {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .servone-source {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
    padding-left: 0.625rem;
    border-left: 2px solid var(--theme-divider-color);
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .servone-source-author {
    flex-shrink: 0;
    font-weight: 500;
    color: var(--theme-caption-color);
  }
</style>
