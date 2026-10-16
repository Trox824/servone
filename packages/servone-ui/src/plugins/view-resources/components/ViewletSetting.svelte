<script lang="ts">
  import core, {
    type AnyAttribute,
    type Association,
    type AssociationQuery,
    type Class,
    type Doc,
    type Ref
  } from '@hcengineering/core'
  import { type Asset, getEmbeddedLabel, type IntlString, translate } from '@hcengineering/platform'
  import { createQuery, getAttributePresenterClass, getClient, hasResource } from '@hcengineering/presentation'
  import {
    addNotification,
    Button,
    DropdownLabelsIntl,
    Label,
    Loading,
    NotificationSeverity,
    resizeObserver,
    resolvedLocationStore
  } from '@hcengineering/ui'
  import type { BuildModelKey, Viewlet, ViewletPreference } from '@hcengineering/view'
  import { deepEqual } from 'fast-equals'
  import { createEventDispatcher } from 'svelte'
  import { workflowColumnLabel } from '../../tracker-resources/components/issues/workflowItem'
  import { WORKFLOW_APP_ALIAS } from '../../tracker-resources/workflows/plugin'
  import view from '../plugin'
  import { buildConfigLookup, canResolveAttribute, getKeyLabel } from '../utils'
  import { type AttributeConfig, type Config, isAttribute } from '../viewOptions'
  import ViewletClassSettings from './ViewletClassSettings.svelte'
  import MailActionToast from '../../../mail/components/MailActionToast.svelte'
  import { registerUndoAction } from '../../card-resources/studio/undo-actions'

  type ColumnKey = BuildModelKey | string
  type ChainStep = [Ref<Association>, 1 | -1]
  type AssociationSide = 'a' | 'b'

  const ASSOCIATIONS_PREFIX = '$associations.'
  const LOOKUP_PREFIX = '$lookup.'
  const CUSTOM_PREFIX = 'custom'
  const PATH_SEPARATOR = ' › '
  const resetColumnsLabel = 'view:string:ServoneResetColumns' as IntlString

  export let viewlet: Viewlet
  export let defaultConfig: ColumnKey[] | undefined = undefined
  export let embedded = false

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const preferenceQuery = createQuery()

  let relatedViewlets: Viewlet[] = []
  let preferences: ViewletPreference[] = []
  let isLoadingPreferences = true
  let isBuilding = true
  let pickedViewletId: Ref<Viewlet> = viewlet._id
  let columnEntries: Config[] = []
  let buildTicket = 0

  function keyOf (value: ColumnKey | undefined): string | undefined {
    return typeof value === 'string' ? value : value?.key
  }

  async function loadRelatedViewlets (panelViewlet: Viewlet): Promise<void> {
    const descendants = hierarchy.getDescendants(panelViewlet.attachTo).filter((candidate) => !hierarchy.isMixin(candidate))
    const attachToClasses = [...new Set([panelViewlet.attachTo, ...descendants])]
    const found = await client.findAll(view.class.Viewlet, {
      attachTo: { $in: attachToClasses },
      variant: panelViewlet.variant ? panelViewlet.variant : { $exists: false },
      descriptor: panelViewlet.descriptor
    })
    if (panelViewlet === viewlet) relatedViewlets = found
  }

  $: void loadRelatedViewlets(viewlet)

  function watchPreferences (related: Viewlet[]): void {
    if (related.length === 0) {
      preferenceQuery.unsubscribe()
      return
    }
    preferenceQuery.query(
      view.class.ViewletPreference,
      { space: core.space.Workspace, attachedTo: { $in: related.map((relatedViewlet) => relatedViewlet._id) } },
      (found) => {
        preferences = found
        isLoadingPreferences = false
      }
    )
  }

  $: watchPreferences(relatedViewlets)

  $: pickedViewlet = relatedViewlets.find((relatedViewlet) => relatedViewlet._id === pickedViewletId)
  $: pickedPreference = preferences.find((preference) => preference.attachedTo === pickedViewletId)

  function makeColumn (value: ColumnKey | undefined, label: IntlString, columnClass: Ref<Class<Doc>>, enabled: boolean): AttributeConfig {
    return { type: 'attribute', value, enabled, label, _class: columnClass, icon: hierarchy.getClass(columnClass).icon as Asset }
  }

  function isPresent (entries: Config[], newValue: ColumnKey | undefined, label: IntlString): boolean {
    const newKey = keyOf(newValue)
    if (newKey === undefined) return false
    return entries.some((entry) => {
      if (!isAttribute(entry)) return false
      return keyOf(entry.value) === newKey || (newKey === '' && entry.label === label)
    })
  }

  function addIfAbsent (entries: Config[], column: AttributeConfig): void {
    if (!isPresent(entries, column.value, column.label)) entries.push(column)
  }

  function presenterMixinFor (category: string): typeof view.mixin.AttributePresenter {
    if (category === 'object') return view.mixin.ObjectPresenter as typeof view.mixin.AttributePresenter
    if (category === 'collection') return view.mixin.CollectionPresenter as typeof view.mixin.AttributePresenter
    return view.mixin.AttributePresenter
  }

  function hasUsablePresenter (attributeType: AnyAttribute['type']): boolean {
    const { attrClass, category } = getAttributePresenterClass(hierarchy, attributeType)
    const presenter = hierarchy.classHierarchyMixin(
      attrClass,
      presenterMixinFor(category),
      (mixinData) => hasResource(mixinData.presenter) ?? false
    )?.presenter
    return presenter !== undefined
  }

  function isListableAttribute (attribute: AnyAttribute): boolean {
    return attribute.hidden !== true && !(attribute.label === undefined || attribute.label === '') && !hierarchy.isDerived(attribute.type._class, core.class.Collection)
  }

  function plainKeyFor (attribute: AnyAttribute): string {
    const { attrClass } = getAttributePresenterClass(hierarchy, attribute.type)
    const hasAttributePresenter = hierarchy.classHierarchyMixin(attrClass, view.mixin.AttributePresenter)?.presenter !== undefined
    if (!hasAttributePresenter && hierarchy.isDerived(attribute.type._class, core.class.RefTo)) {
      return LOOKUP_PREFIX + attribute.name
    }
    return attribute.name
  }

  function candidateValue (attribute: AnyAttribute, plainKey: string, isMixinAttribute: boolean): ColumnKey {
    if (isMixinAttribute) return `${attribute.attributeOf}.${attribute.name}`
    const extraProps = viewlet.configOptions?.extraProps
    if (extraProps !== undefined) return { ...extraProps, key: plainKey }
    if (attribute.name.startsWith(CUSTOM_PREFIX)) return { key: plainKey, displayProps: { optional: true } }
    return plainKey
  }

  function addAttributeCandidate (entries: Config[], attribute: AnyAttribute, isMixinAttribute: boolean): void {
    if (!isListableAttribute(attribute)) return
    if ((viewlet.configOptions?.hiddenKeys ?? []).includes(attribute.name)) return
    const plainKey = plainKeyFor(attribute)
    const isClashing = entries.some((entry) => {
      const entryKey = keyOf(entry.value)
      if (entryKey === undefined) return false
      if (entryKey === attribute.name || entryKey === plainKey) return true
      return entryKey === '' && isAttribute(entry) && entry.label === attribute.label
    })
    if (isClashing) return
    if (!hasUsablePresenter(attribute.type)) return
    addIfAbsent(
      entries,
      makeColumn(candidateValue(attribute, plainKey, isMixinAttribute), attribute.label, attribute.attributeOf, false)
    )
  }

  async function addTargetFields (
    entries: Config[],
    fullKey: string,
    displayPath: string,
    targetClass: Ref<Class<Doc>>
  ): Promise<void> {
    for (const attribute of hierarchy.getAllAttributes(targetClass).values()) {
      if (!isListableAttribute(attribute) || !hasUsablePresenter(attribute.type)) continue
      const fieldKey = `${fullKey}.${attribute.name}`
      const fieldLabel = await translate(getKeyLabel(client, viewlet.attachTo, fieldKey, undefined), {})
      addIfAbsent(entries, makeColumn(fieldKey, getEmbeddedLabel(`${displayPath} > ${fieldLabel}`), targetClass, false))
    }
  }

  async function addAssociation (
    entries: Config[],
    association: Association,
    side: AssociationSide,
    sourcePreference: ViewletPreference | undefined,
    chain: ChainStep[]
  ): Promise<void> {
    const ownSegment = `${ASSOCIATIONS_PREFIX}${association._id}_${side}`
    const chainSegments = chain.map(([id, direction]) => `${ASSOCIATIONS_PREFIX}${id}_${direction === 1 ? 'a' : 'b'}`)
    const fullKey = [...chainSegments, ownSegment].join('.')
    const name = side === 'a' ? association.nameA : association.nameB
    const targetClass = side === 'a' ? association.classA : association.classB
    if (name.trim() === '') return
    const chainNames = chain
      .map(([id, direction]) => {
        const chainAssociation = client.getModel().findObject(id)
        return direction === 1 ? chainAssociation?.nameA : chainAssociation?.nameB
      })
      .filter((chainName): chainName is string => chainName !== undefined && chainName !== '')
    const displayPath = [...chainNames, name].join(PATH_SEPARATOR)
    addIfAbsent(entries, makeColumn(fullKey, getEmbeddedLabel(displayPath), targetClass, false))
    const isExpanded = sourcePreference?.config.some((item) => keyOf(item) === fullKey) === true
    if (!isExpanded) return
    const nextChain: ChainStep[] = [...chain, [association._id, side === 'a' ? 1 : -1]]
    void addAssociationCandidates(entries, targetClass, sourcePreference, nextChain)
    await addTargetFields(entries, fullKey, displayPath, targetClass)
  }

  async function addAssociationCandidates (
    entries: Config[],
    ownerClass: Ref<Class<Doc>>,
    sourcePreference: ViewletPreference | undefined,
    chain: ChainStep[]
  ): Promise<void> {
    const ancestors = hierarchy.getAncestors(ownerClass)
    const parentClass = hierarchy.getParentClass(ownerClass)
    const relatedMixins = hierarchy
      .getDescendants(parentClass)
      .filter((candidate) => hierarchy.isMixin(candidate) && ancestors.includes(hierarchy.getBaseClass(candidate)))
    for (const mixinClass of relatedMixins) {
      for (const attribute of hierarchy.getOwnAttributes(mixinClass).values()) {
        addAttributeCandidate(entries, attribute, true)
      }
    }
    const classSet = [...ancestors, ...relatedMixins]
    const model = client.getModel()
    const pending: Array<{ association: Association, side: AssociationSide }> = [
      ...model.findAllSync(core.class.Association, { classA: { $in: classSet } }).map((association) => ({ association, side: 'b' as const })),
      ...model.findAllSync(core.class.Association, { classB: { $in: classSet } }).map((association) => ({ association, side: 'a' as const }))
    ]
    for (const { association, side } of pending) {
      await addAssociation(entries, association, side, sourcePreference, chain)
    }
  }

  function compareByOrder (left: Config, right: Config): number {
    if (!isAttribute(left) || !isAttribute(right)) return 0
    if (left.order === undefined && right.order === undefined) return 0
    if (left.order === undefined) return 1
    if (right.order === undefined) return -1
    return left.order - right.order
  }

  async function buildEntries (source: Viewlet, sourcePreference: ViewletPreference | undefined): Promise<Config[]> {
    const configItems = defaultConfig ?? source.config
    const lookup = buildConfigLookup(hierarchy, source.attachTo, configItems, source.options?.lookup)
    const hiddenKeys = source.configOptions?.hiddenKeys ?? []
    const sourceClassLabel = hierarchy.getClass(source.attachTo).label
    const entries: Config[] = []
    let hasMetOptional = false

    for (const item of configItems) {
      const itemKey = keyOf(item)
      if (itemKey !== undefined && hiddenKeys.includes(itemKey)) continue
      if (typeof item === 'string') {
        if (item === '') {
          entries.push(makeColumn('', sourceClassLabel, source.attachTo, true))
        } else if (item.startsWith(ASSOCIATIONS_PREFIX)) {
          entries.push(makeColumn(item, getKeyLabel(client, viewlet.attachTo, item, undefined), source.attachTo, true))
        } else if (canResolveAttribute(hierarchy, source.attachTo, item, lookup)) {
          const columnValue: ColumnKey = item.startsWith(CUSTOM_PREFIX) ? { key: item, displayProps: { optional: true } } : item
          entries.push(makeColumn(columnValue, getKeyLabel(client, source.attachTo, item, lookup), source.attachTo, true))
        }
        continue
      }
      if (item.displayProps?.grow === true) {
        entries.push({ type: 'divider', value: item })
        continue
      }
      if (item.displayProps?.optional === true && !hasMetOptional) {
        entries.push({ type: 'divider', value: '' })
      }
      if (item.displayProps?.optional === true) hasMetOptional = true
      if (!canResolveAttribute(hierarchy, source.attachTo, item.key, lookup)) continue
      entries.push(makeColumn(item, item.label ?? getKeyLabel(client, source.attachTo, item.key, lookup), source.attachTo, true))
    }

    if (source.configOptions?.strict !== true) {
      for (const attribute of hierarchy.getAllAttributes(source.attachTo).values()) {
        addAttributeCandidate(entries, attribute, false)
      }
      for (const descendant of hierarchy.getDescendants(source.attachTo)) {
        if (!hierarchy.isMixin(descendant)) continue
        for (const attribute of hierarchy.getOwnAttributes(descendant).values()) {
          addAttributeCandidate(entries, attribute, true)
        }
      }
      await addAssociationCandidates(entries, source.attachTo, sourcePreference, [])
    }

    if (sourcePreference !== undefined) {
      for (const entry of entries) {
        if (!isAttribute(entry)) continue
        const position = sourcePreference.config.findIndex((storedItem) => deepEqual(storedItem, entry.value))
        entry.enabled = position >= 0
        entry.order = position >= 0 ? position : undefined
      }
      if (viewlet.configOptions?.sortable === true) entries.sort(compareByOrder)
    }
    return entries
  }

  async function rebuildEntries (source: Viewlet | undefined, sourcePreference: ViewletPreference | undefined): Promise<void> {
    buildTicket += 1
    const ticket = buildTicket
    if (source === undefined) {
      columnEntries = []
      isBuilding = false
      return
    }
    isBuilding = true
    const built = await buildEntries(source, sourcePreference)
    if (ticket !== buildTicket) return
    columnEntries = built
    isBuilding = false
  }

  $: void rebuildEntries(pickedViewlet, pickedPreference)

  function isGrowDivider (entry: Config): boolean {
    return entry.type === 'divider' && typeof entry.value === 'object' && entry.value.displayProps?.grow === true
  }

  function namesSourceAttribute (sourceClass: Ref<Class<Doc>>, key: string): boolean {
    const attributeName = key.startsWith(LOOKUP_PREFIX) ? key.slice(LOOKUP_PREFIX.length) : key.slice(key.lastIndexOf('.') + 1)
    return hierarchy.getAllAttributes(sourceClass).has(attributeName)
  }

  function mergeConfigs (
    sourceClass: Ref<Class<Doc>>,
    previousConfig: ColumnKey[],
    newConfig: ColumnKey[],
    targetConfig: ColumnKey[]
  ): ColumnKey[] {
    const usedTargetPositions = new Set<number>()
    const merged = newConfig.map((sourceItem) => {
      const sourceKey = keyOf(sourceItem)
      const position = targetConfig.findIndex((targetItem, index) => !usedTargetPositions.has(index) && keyOf(targetItem) === sourceKey)
      if (position < 0) return sourceItem
      usedTargetPositions.add(position)
      return targetConfig[position]
    })
    const newKeys = new Set(newConfig.map(keyOf))
    const previousKeys = new Set(previousConfig.map(keyOf))
    targetConfig.forEach((targetItem, position) => {
      if (usedTargetPositions.has(position)) return
      const targetKey = keyOf(targetItem)
      const isRemovedBySource =
        targetKey !== undefined &&
        !newKeys.has(targetKey) &&
        (previousKeys.has(targetKey) || namesSourceAttribute(sourceClass, targetKey))
      if (isRemovedBySource) return
      merged.splice(Math.min(position, merged.length), 0, targetItem)
    })
    return merged
  }

  async function writeConfig (targetId: Ref<Viewlet>, config: ColumnKey[]): Promise<void> {
    const existing = preferences.find((preference) => preference.attachedTo === targetId)
    if (existing === undefined) {
      await client.createDoc(view.class.ViewletPreference, core.space.Workspace, { attachedTo: targetId, config })
    } else if (!deepEqual(existing.config, config)) {
      await client.update(existing, { config })
    }
  }

  async function saveColumns (targetId: Ref<Viewlet>, savedEntries: Config[]): Promise<void> {
    const newConfig: ColumnKey[] = []
    for (const entry of savedEntries) {
      if (entry.value === undefined) continue
      if (!isGrowDivider(entry) && !(isAttribute(entry) && entry.enabled)) continue
      const savedValue = entry.value
      const isCustomKey = typeof savedValue === 'string' && savedValue.startsWith(CUSTOM_PREFIX)
      newConfig.push(typeof savedValue === 'string' && isCustomKey ? { key: savedValue, displayProps: { optional: true } } : savedValue)
    }
    const targetViewlet = relatedViewlets.find((relatedViewlet) => relatedViewlet._id === targetId)
    const previousConfig =
      preferences.find((preference) => preference.attachedTo === targetId)?.config ?? targetViewlet?.config ?? []
    await writeConfig(targetId, newConfig)
    if (targetViewlet === undefined) return
    for (const derived of relatedViewlets) {
      if (derived.attachTo === targetViewlet.attachTo || !hierarchy.isDerived(derived.attachTo, targetViewlet.attachTo)) continue
      const derivedConfig = preferences.find((preference) => preference.attachedTo === derived._id)?.config ?? derived.config
      const merged = mergeConfigs(targetViewlet.attachTo, previousConfig, newConfig, derivedConfig)
      if (deepEqual(merged, derivedConfig)) continue
      await writeConfig(derived._id, merged)
    }
  }

  async function restoreDefaults (): Promise<void> {
    const targetId = pickedViewletId
    const existing = preferences.find((preference) => preference.attachedTo === targetId)
    if (existing === undefined) return
    const savedConfig = existing.config
    await client.remove(existing)
    const undoId = `reset-columns-${targetId}-${Date.now()}`
    registerUndoAction(undoId, () => {
      void writeConfig(targetId, savedConfig)
    })
    const [title, undoLabel] = await Promise.all([
      translate('view:string:ServoneColumnsReset' as IntlString, {}),
      translate('view:string:ServoneUndo' as IntlString, {})
    ])
    addNotification(title, '', MailActionToast, { changeId: undoId, actionLabel: undoLabel }, NotificationSeverity.Success)
  }

  function classLabelFor (attachTo: Ref<Class<Doc>>, appSegment: string | undefined): IntlString {
    const label = hierarchy.getClass(attachTo).label
    return appSegment === WORKFLOW_APP_ALIAS ? workflowColumnLabel(label) : label
  }

  $: classItems = relatedViewlets.map((relatedViewlet) => ({
    id: relatedViewlet._id,
    label: classLabelFor(relatedViewlet.attachTo, $resolvedLocationStore.path[2])
  }))
  $: isLoading = isLoadingPreferences || isBuilding
  $: showClassPicker = relatedViewlets.length > 1
</script>

{#if embedded}
  <div class="flex flex-col gap-2" use:resizeObserver={() => { dispatch('changeContent') }}>
    <div class="flex h-7 items-center justify-between gap-2">
      <span class="text-sm font-medium text-foreground"><Label label={view.string.ConfigureColumns} /></span>
      <Button label={resetColumnsLabel} kind="ghost" size="x-small" on:click={restoreDefaults} />
    </div>
    {#if isLoading}
      <Loading />
    {:else}
      {#if showClassPicker}
        <DropdownLabelsIntl
          kind="ghost"
          size="small"
          items={classItems}
          selected={pickedViewletId}
          width="100%"
          on:selected={(event) => { pickedViewletId = event.detail }}
        />
      {/if}
      {#if pickedViewlet !== undefined}
        <ViewletClassSettings
          {viewlet}
          items={columnEntries}
          on:save={(event) => { void saveColumns(pickedViewletId, event.detail) }}
          on:restoreDefaults={restoreDefaults}
        />
      {/if}
    {/if}
  </div>
{:else}
  <div class="selectPopup" use:resizeObserver={() => { dispatch('changeContent') }}>
    <div class="menu-space"></div>
    <div class="scroll">
      <div class="box">
        {#if isLoading}
          <Loading />
        {:else}
          {#if showClassPicker}
            <div class="p-1">
              <DropdownLabelsIntl
                kind="ghost"
                items={classItems}
                selected={pickedViewletId}
                width="100%"
                on:selected={(event) => { pickedViewletId = event.detail }}
              />
            </div>
          {/if}
          {#if pickedViewlet !== undefined}
            <ViewletClassSettings
              {viewlet}
              items={columnEntries}
              on:save={(event) => { void saveColumns(pickedViewletId, event.detail) }}
              on:restoreDefaults={restoreDefaults}
            />
          {/if}
        {/if}
      </div>
    </div>
    <div class="menu-space"></div>
  </div>
{/if}
