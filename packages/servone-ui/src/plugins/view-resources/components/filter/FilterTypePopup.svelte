<script lang="ts">
  import core, {
    type AnyAttribute,
    type ArrOf,
    type Class,
    ClassifierKind,
    type Doc,
    type PropertyType,
    type Ref,
    type RefTo,
    type Space,
    type Type
  } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import {
    Icon,
    closePopup,
    closeTooltip,
    resizeObserver,
    resolvedLocationStore,
    showPopup,
    tooltip
  } from '@hcengineering/ui'
  import { type Asset, getResource, translate } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { Calendar, ChevronRight, Hash, List, Tag, ToggleLeft, Type as TextType, User } from '@lucide/svelte'
  import { createEventDispatcher, type ComponentType } from 'svelte'
  import MenuSearch from '../../../../components/MenuSearch.svelte'
  import { menuItemClass, menuPopupClass, menuScrollClass, menuSeparatorClass } from '../../../../lib/menu-classes'
  import { type ClassFilters, type Filter, type KeyFilter, type ViewOptions } from '@hcengineering/view'
  import { FilterQuery, buildFilterKey } from '../../filter'
  import view from '../../plugin'
  import { adjustIssueFilters } from '../../../tracker-resources/sprints/filterMenu'
  import { WORKFLOW_APP_ALIAS } from '../../../tracker-resources/workflows/plugin'

  interface FilterRow {
    entry: KeyFilter
    text: string
    platformIcon: Asset | undefined
    glyph: ComponentType
    canNest: boolean
  }

  export let _class: Ref<Class<Doc>>
  export let space: Ref<Space> | undefined
  export let target: HTMLElement
  export let filter: Filter | undefined
  export let index: number
  export let onChange: (e: Filter) => void
  export let nestedFrom: KeyFilter | undefined = undefined
  export let viewOptions: ViewOptions | undefined = undefined

  const dispatch = createEventDispatcher()
  const hierarchy = getClient().getHierarchy()

  const groupBucket = { top: 0, bottom: 2 }
  const glyphByTypeClass: Array<[Ref<Class<Type<PropertyType>>>, ComponentType]> = [
    [core.class.TypeDate, Calendar],
    [core.class.TypeTimestamp, Calendar],
    [core.class.TypeNumber, Hash],
    [core.class.TypeBoolean, ToggleLeft],
    [core.class.EnumOf, List],
    [core.class.TypeString, TextType],
    [core.class.TypeMarkup, TextType]
  ]

  let searchText = ''
  let rows: FilterRow[] | undefined
  let headerRow: FilterRow | undefined
  let loadRequestId = 0
  const focusableRows = new Map<number, HTMLElement>()

  $: nestedClassId = nestedFrom?._class
  $: nestedKeyName = nestedFrom?.key
  $: listClass = nestedClassId !== undefined && nestedKeyName !== undefined ? resolveReferencedClass(nestedClassId, nestedKeyName) : _class
  $: void loadRows(listClass, space)
  $: lowerSearch = searchText.toLowerCase()
  $: firstPosition = nestedClassId !== undefined ? -1 : 0

  function resolveReferencedClass (ownerClass: Ref<Class<Doc>>, attributeKey: string): Ref<Class<Doc>> {
    return (hierarchy.getAttribute(ownerClass, attributeKey).type as RefTo<Doc>).to
  }

  function groupRank (entry: KeyFilter): number {
    if (entry.group === 'top') return groupBucket.top
    if (entry.group === 'bottom') return groupBucket.bottom
    return 1
  }

  function orderByGroup (entries: KeyFilter[]): KeyFilter[] {
    return [...entries].sort((first, second) => groupRank(first) - groupRank(second))
  }

  async function collectEntries (sourceClass: Ref<Class<Doc>>, spaceRef: Ref<Space> | undefined): Promise<KeyFilter[]> {
    const classFilters = hierarchy.classHierarchyMixin<Class<Doc>, ClassFilters>(sourceClass, view.mixin.ClassFilters)
    if (classFilters === undefined) return []
    const baseClass = hierarchy.getBaseClass(sourceClass)
    const entries: KeyFilter[] = []

    for (const configured of classFilters.filters) {
      if (typeof configured === 'string') {
        const built = buildFilterKey(
          hierarchy,
          classFilters._id,
          configured,
          hierarchy.getAttribute(classFilters._id, configured)
        )
        if (built !== undefined) entries.push({ ...built, group: built.group ?? 'top' })
      } else if (configured.key !== '') {
        const attribute = hierarchy.getAttribute(configured._class, configured.key)
        entries.push({
          ...configured,
          attribute,
          label: configured.label ?? attribute.label,
          group: configured.group ?? 'top'
        })
      }
    }

    async function finish (list: KeyFilter[]): Promise<KeyFilter[]> {
      const adjusted = adjustIssueFilters(
        hierarchy,
        baseClass,
        list,
        (key) => buildFilterKey(hierarchy, baseClass, key, hierarchy.getAttribute(baseClass, key)),
        $resolvedLocationStore.path[2] === WORKFLOW_APP_ALIAS
      )
      if (classFilters?.getVisibleFilters === undefined) return adjusted
      const filterVisible = await getResource(classFilters.getVisibleFilters)
      return await filterVisible(adjusted, spaceRef)
    }

    if (classFilters.strict === true) return await finish(entries)

    function addDerived (owner: Ref<Class<Doc>>, attribute: AnyAttribute): void {
      if (attribute.label === undefined || attribute.hidden === true) return
      if (entries.some((existing) => existing.attribute.name === attribute.name)) return
      const built = buildFilterKey(hierarchy, owner, attribute.name, attribute)
      if (built !== undefined) entries.push(built)
    }

    const ignoredKeys = new Set(classFilters.ignoreKeys ?? [])
    const seenKeys = new Set<string>()

    for (const [attributeKey, attribute] of hierarchy.getAllAttributes(baseClass)) {
      seenKeys.add(attributeKey)
      if (!ignoredKeys.has(attributeKey)) addDerived(baseClass, attribute)
    }

    function addUnseenOwn (mixinClass: Ref<Class<Doc>>): void {
      for (const [attributeKey, attribute] of hierarchy.getOwnAttributes(mixinClass)) {
        if (seenKeys.has(attributeKey)) continue
        seenKeys.add(attributeKey)
        addDerived(mixinClass, attribute)
      }
    }

    for (const descendant of hierarchy.getDescendants(baseClass)) {
      if (hierarchy.findClass(descendant)?.kind === ClassifierKind.MIXIN) addUnseenOwn(descendant)
    }

    const baseAncestors = hierarchy.getAncestors(baseClass)
    for (const sibling of hierarchy.getDescendants(hierarchy.getParentClass(baseClass))) {
      const siblingClass = hierarchy.getClass(sibling)
      const extendsAncestor = siblingClass.extends !== undefined && baseAncestors.includes(siblingClass.extends)
      if (hierarchy.isMixin(siblingClass._id) && extendsAncestor) addUnseenOwn(siblingClass._id)
    }

    return await finish(entries)
  }

  function describeGlyph (entry: KeyFilter): { platformIcon: Asset | undefined, glyph: ComponentType } {
    let attributeType: Type<PropertyType> | undefined = (entry.attribute ?? hierarchy.findAttribute(entry._class, entry.key))?.type
    while (attributeType !== undefined && hierarchy.isDerived(attributeType._class, core.class.ArrOf)) {
      attributeType = (attributeType as ArrOf<PropertyType>).of
    }
    if (attributeType === undefined) return { platformIcon: undefined, glyph: Tag }

    if (hierarchy.isDerived(attributeType._class, core.class.RefTo)) {
      const referenced = (attributeType as RefTo<Doc>).to
      const platformIcon = hierarchy.findClass(referenced)?.icon
      if (platformIcon !== undefined) return { platformIcon, glyph: Tag }
      return { platformIcon: undefined, glyph: hierarchy.isDerived(referenced, core.class.Account) ? User : Tag }
    }

    const matched = glyphByTypeClass.find(([typeClass]) => hierarchy.isDerived(attributeType?._class ?? typeClass, typeClass))
    return { platformIcon: undefined, glyph: matched?.[1] ?? Tag }
  }

  function canNestInto (entry: KeyFilter): boolean {
    if (entry.showNested === false) return false
    const referenced = (hierarchy.getAttribute(entry._class, entry.key).type as RefTo<Doc>).to
    if (referenced === undefined) return false
    return hierarchy.hasMixin(hierarchy.getClass(referenced), view.mixin.ClassFilters)
  }

  async function toRow (entry: KeyFilter): Promise<FilterRow> {
    const text = await translate(entry.label, {}, $themeStore.language)
    return { entry, text, ...describeGlyph(entry), canNest: canNestInto(entry) }
  }

  async function loadRows (sourceClass: Ref<Class<Doc>>, spaceRef: Ref<Space> | undefined): Promise<void> {
    const requestId = ++loadRequestId
    const entries = orderByGroup(await collectEntries(sourceClass, spaceRef))
    const loadedRows = await Promise.all(entries.map(toRow))
    const loadedHeader = nestedFrom !== undefined ? await toRow(nestedFrom) : undefined
    if (requestId !== loadRequestId) return
    headerRow = loadedHeader
    rows = loadedRows
  }

  function matchesSearch (row: FilterRow, needle: string): boolean {
    return needle === '' || row.text.toLowerCase().includes(needle)
  }

  function pickEntry (entry: KeyFilter, isHeader: boolean): void {
    closePopup()
    closeTooltip()
    const editedFilter = filter ?? ({ key: entry, value: [], index } as Filter)
    const parentAttribute = nestedFrom
    if (parentAttribute === undefined || isHeader) {
      showPopup(entry.component, { _class, space, filter: editedFilter, onChange, viewOptions }, target)
      return
    }
    const forwardNested = (received: Filter | undefined): void => {
      if (received === undefined) return
      onChange({
        key: parentAttribute,
        index,
        mode: view.filter.FilterNestedMatch,
        modes: [view.filter.FilterNestedMatch, view.filter.FilterNestedDontMatch],
        nested: received,
        value: received.value,
        onRemove: () => {
          FilterQuery.remove(index)
        }
      })
      dispatch('close')
    }
    showPopup(
      entry.component,
      { _class: listClass, space, filter: editedFilter, onChange: forwardNested, viewOptions },
      target
    )
  }

  function trackRow (node: HTMLElement, position: number): { update: (next: number) => void, destroy: () => void } {
    let currentPosition = position
    focusableRows.set(currentPosition, node)
    return {
      update (next) {
        focusableRows.delete(currentPosition)
        currentPosition = next
        focusableRows.set(currentPosition, node)
      },
      destroy () {
        if (focusableRows.get(currentPosition) === node) focusableRows.delete(currentPosition)
      }
    }
  }

  function submenuTooltip (node: HTMLElement, entry: KeyFilter): ReturnType<typeof tooltip> {
    const describe = (nextEntry: KeyFilter): Parameters<typeof tooltip>[1] => ({
      component: view.component.FilterTypePopup,
      props: { _class, space, index, target, onChange, nestedFrom: nextEntry },
      element: node,
      kind: 'submenu'
    })
    const inner = tooltip(node, describe(entry))
    return {
      update (nextEntry: KeyFilter) {
        inner?.update?.(describe(nextEntry))
      },
      destroy () {
        inner?.destroy?.()
      }
    }
  }

  function focusSelf (event: MouseEvent): void {
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
  }

  function handleRowKey (event: KeyboardEvent, position: number): void {
    if (rows === undefined) return
    const lastPosition = rows.length - 1
    if (event.key === 'ArrowLeft') {
      dispatch('close')
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusableRows.get(position + 1 > lastPosition ? firstPosition : position + 1)?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusableRows.get(position - 1 < firstPosition ? lastPosition : position - 1)?.focus()
    }
  }
</script>

<div
  class="{menuPopupClass} w-[15rem]"
  use:resizeObserver={() => {
    dispatch('changeContent')
  }}
>
  <MenuSearch bind:value={searchText} placeholder={view.string.AddFilter} autoFocus={true} />
  <div class={menuScrollClass}>
    {#if rows}
      {#if headerRow}
        <button
          class={menuItemClass}
          type="button"
          use:trackRow={-1}
          on:mouseover={focusSelf}
          on:keydown={(event) => handleRowKey(event, -1)}
          on:click={() => headerRow && pickEntry(headerRow.entry, true)}
        >
          {@render rowContent(headerRow)}
        </button>
        <div class={menuSeparatorClass}></div>
      {/if}
      {#each rows as row, position}
        {#if matchesSearch(row, lowerSearch)}
          {#if filter === undefined && nestedFrom === undefined && row.canNest}
            <div
              class={menuItemClass}
              role="menuitem"
              tabindex="-1"
              use:submenuTooltip={row.entry}
              on:mouseover={focusSelf}
              on:keydown={(event) => handleRowKey(event, position)}
            >
              {@render rowContent(row)}
              <ChevronRight size={14} class="shrink-0 text-muted-foreground" />
            </div>
          {:else}
            <button
              class={menuItemClass}
              type="button"
              use:trackRow={position}
              on:mouseover={focusSelf}
              on:keydown={(event) => handleRowKey(event, position)}
              on:click={() => pickEntry(row.entry, false)}
            >
              {@render rowContent(row)}
            </button>
          {/if}
          {#if searchText === '' && rows[position + 1] !== undefined && rows[position + 1].entry.group !== row.entry.group}
            <div class={menuSeparatorClass}></div>
          {/if}
        {/if}
      {/each}
    {/if}
  </div>
</div>

{#snippet rowContent(row)}
  <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
    {#if row.platformIcon}
      <Icon icon={row.platformIcon} size={'small'} />
    {:else}
      <svelte:component this={row.glyph} size={14} />
    {/if}
  </span>
  <span class="min-w-0 flex-1 truncate">{row.text}</span>
{/snippet}
