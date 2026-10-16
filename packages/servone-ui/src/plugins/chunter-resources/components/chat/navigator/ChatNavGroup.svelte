<script lang="ts">
  import { onDestroy } from 'svelte'
  import activity from '@hcengineering/activity'
  import core, { groupByArray, type Class, type Doc, type Ref, type Space } from '@hcengineering/core'
  import type { DocNotifyContext } from '@hcengineering/notification'
  import { InboxNotificationsClientImpl } from '@hcengineering/notification-resources'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery, getClient, type LiveQuery } from '@hcengineering/presentation'
  import type { Action } from '@hcengineering/ui'
  import chunter from '../../../plugin'
  import type { ChatGroup, ChatNavGroupModel } from '../types'
  import ChatNavSection from './ChatNavSection.svelte'
  import { liveSectionId } from '../../../../../lib/chat/sections'
  import { sectionString, sectionsContext } from '../../../sections/store'
  import { moveToSection, removeFromSection } from '../../../sections/actions'

  interface NavSectionEntry {
    id: string
    label: IntlString
    objects: Doc[]
    count: number
    sectionClass: Ref<Class<Doc>> | undefined
  }

  export let object: Doc | undefined
  export let model: ChatNavGroupModel
  export let sectionId: Ref<Doc> | undefined = undefined

  const DEFAULT_ITEM_LIMIT = 5
  const SHOW_MORE_STEP = 50

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const inboxClient = InboxNotificationsClientImpl.getClient()
  const allContexts = inboxClient.contexts
  const contextByDoc = inboxClient.contextByDoc
  const customSections = sectionsContext()

  const classQueries = new Map<Ref<Class<Doc>>, LiveQuery>()
  const classLimits = new Map<Ref<Class<Doc>>, number>()
  let loadedDocsByClass = new Map<Ref<Class<Doc>>, Doc[]>()
  let loadedTotalByClass = new Map<Ref<Class<Doc>>, number>()

  $: liveSectionIds = new Set($customSections.map((section) => section._id))

  function isContextInGroup (
    context: DocNotifyContext,
    groupModel: ChatNavGroupModel,
    targetSectionId: Ref<Doc> | undefined,
    liveIds: ReadonlySet<Ref<Doc>>
  ): boolean {
    if (context.hidden || context.isPinned !== groupModel.isPinned) return false
    const filedSectionId = liveSectionId(context, liveIds)
    if (targetSectionId !== undefined && filedSectionId !== targetSectionId) return false
    if (targetSectionId === undefined && !groupModel.isPinned && filedSectionId !== undefined) return false
    if (groupModel._class !== undefined && context.objectClass !== groupModel._class) return false
    if (groupModel.skipClasses?.includes(context.objectClass) === true) return false
    return hierarchy.classHierarchyMixin(context.objectClass, activity.mixin.ActivityDoc) !== undefined
  }

  $: keptContexts = $allContexts.filter((context) => isContextInGroup(context, model, sectionId, liveSectionIds))

  function dropClassState (staleClass: Ref<Class<Doc>>): void {
    classQueries.get(staleClass)?.unsubscribe()
    classQueries.delete(staleClass)
    classLimits.delete(staleClass)
    loadedDocsByClass.delete(staleClass)
    loadedTotalByClass.delete(staleClass)
    loadedDocsByClass = loadedDocsByClass
    loadedTotalByClass = loadedTotalByClass
  }

  function loadClassDocs (contextClass: Ref<Class<Doc>>, classContexts: DocNotifyContext[]): void {
    const isSpaceClass = hierarchy.isDerived(contextClass, core.class.Space)
    if (!classLimits.has(contextClass)) classLimits.set(contextClass, model.maxSectionItems ?? DEFAULT_ITEM_LIMIT)
    const itemLimit = classLimits.get(contextClass) ?? DEFAULT_ITEM_LIMIT
    const queriedContexts = isSpaceClass ? classContexts : classContexts.slice(0, itemLimit)
    const idFilter = { $in: queriedContexts.map((context) => context.objectId) }
    const selector = isSpaceClass
      ? { _id: idFilter, space: core.space.Space, archived: false }
      : { _id: idFilter }

    const classQuery = classQueries.get(contextClass) ?? createQuery()
    classQueries.set(contextClass, classQuery)
    classQuery.query(contextClass, selector, (foundDocs) => {
      loadedDocsByClass.set(contextClass, foundDocs)
      loadedTotalByClass.set(contextClass, foundDocs.total)
      loadedDocsByClass = loadedDocsByClass
      loadedTotalByClass = loadedTotalByClass
    }, { total: true })
  }

  function loadDocuments (contexts: DocNotifyContext[]): void {
    const contextsByClass = groupByArray(contexts, (context) => context.objectClass)
    for (const trackedClass of [...classQueries.keys()]) {
      if (!contextsByClass.has(trackedClass)) dropClassState(trackedClass)
    }
    for (const [contextClass, classContexts] of contextsByClass) {
      loadClassDocs(contextClass, classContexts)
    }
  }

  $: loadDocuments(keptContexts)

  function showMore (targetClass: Ref<Class<Doc>> | undefined): void {
    if (targetClass === undefined) return
    classLimits.set(targetClass, (classLimits.get(targetClass) ?? DEFAULT_ITEM_LIMIT) + SHOW_MORE_STEP)
    loadDocuments(keptContexts)
  }

  function groupOfDoc (doc: Doc): ChatGroup {
    if (hierarchy.isDerived(doc._class, chunter.class.Channel)) return 'channels'
    if (hierarchy.isDerived(doc._class, chunter.class.DirectMessage)) return 'direct'
    return 'activity'
  }

  function findInjectedDoc (
    openDoc: Doc | undefined,
    groupId: ChatGroup,
    contextsByDoc: Map<Ref<Doc>, DocNotifyContext>,
    targetSectionId: Ref<Doc> | undefined
  ): Doc | undefined {
    if (targetSectionId !== undefined || openDoc === undefined || groupOfDoc(openDoc) !== groupId) return undefined
    const isArchivedSpace = hierarchy.isDerived(openDoc._class, core.class.Space) && (openDoc as Space).archived
    return !contextsByDoc.has(openDoc._id) || isArchivedSpace ? openDoc : undefined
  }

  $: injectedDoc = findInjectedDoc(object, model.id, $contextByDoc, sectionId)

  function classLabel (targetClass: Ref<Class<Doc>>): IntlString {
    const classDef = hierarchy.getClass(targetClass)
    return classDef.pluralLabel ?? classDef.label
  }

  function buildSections (
    docsByClass: Map<Ref<Class<Doc>>, Doc[]>,
    totalsByClass: Map<Ref<Class<Doc>>, number>,
    groupModel: ChatNavGroupModel,
    targetSectionId: Ref<Doc> | undefined,
    injected: Doc | undefined
  ): NavSectionEntry[] {
    if (!groupModel.wrap) {
      return [
        {
          id: targetSectionId ?? groupModel.id,
          label: groupModel.label ?? chunter.string.Channels,
          objects: [...docsByClass.values()].flat(),
          count: [...totalsByClass.values()].reduce((sum, total) => sum + total, 0),
          sectionClass: undefined
        }
      ]
    }

    const wrappedSections = [...docsByClass.entries()].map(([sectionClass, classDocs]): NavSectionEntry => {
      const shouldAppend =
        injected !== undefined &&
        injected._class === sectionClass &&
        !classDocs.some((classDoc) => classDoc._id === injected._id)
      return {
        id: sectionClass,
        label: classLabel(sectionClass),
        objects: shouldAppend ? [...classDocs, injected] : classDocs,
        count: (totalsByClass.get(sectionClass) ?? 0) + (shouldAppend ? 1 : 0),
        sectionClass
      }
    })

    const isInjectedLoaded =
      injected !== undefined &&
      ([...docsByClass.values()].some((classDocs) => classDocs.some((classDoc) => classDoc._id === injected._id)))
    if (injected !== undefined && !docsByClass.has(injected._class) && !isInjectedLoaded) {
      wrappedSections.push({
        id: injected._id,
        label: classLabel(injected._class),
        objects: [injected],
        count: 1,
        sectionClass: injected._class
      })
    }

    return wrappedSections.sort((first, second) => first.label.localeCompare(second.label))
  }

  $: sections = buildSections(loadedDocsByClass, loadedTotalByClass, model, sectionId, injectedDoc)

  function actionsForSection (
    section: NavSectionEntry,
    contexts: DocNotifyContext[],
    groupModel: ChatNavGroupModel
  ): Action[] {
    if (groupModel.getActionsFn === undefined) return []
    const sectionContexts =
      section.sectionClass === undefined
        ? contexts
        : contexts.filter((context) => context.objectClass === section.sectionClass)
    return groupModel.getActionsFn(sectionContexts)
  }

  $: acceptsDrops = sectionId !== undefined || model.id === 'channels' || model.id === 'direct'

  function dropContext (contextId: Ref<DocNotifyContext>): void {
    const droppedContext = $allContexts.find((context) => context._id === contextId)
    if (droppedContext === undefined) return
    const filedSectionId = liveSectionId(droppedContext, liveSectionIds)
    if (sectionId !== undefined) {
      if (filedSectionId !== sectionId) void moveToSection(client, droppedContext, sectionId)
    } else if (filedSectionId !== undefined) {
      void removeFromSection(client, droppedContext)
    }
  }

  onDestroy(() => {
    for (const classQuery of classQueries.values()) classQuery.unsubscribe()
  })
</script>

{#each sections as section (section.id)}
  <ChatNavSection
    id={section.id}
    objects={section.objects}
    contexts={keptContexts}
    objectId={object?._id}
    header={section.label}
    itemsCount={section.count}
    sortFn={model.sortFn}
    actions={actionsForSection(section, keptContexts, model)}
    emptyLabel={sectionId !== undefined ? sectionString.DragChannelsHere : undefined}
    onDropContext={acceptsDrops ? dropContext : undefined}
    on:show-more={() => showMore(section.sectionClass)}
    on:select
  />
{/each}
