<script lang="ts">
  import core, { type Class, type Doc, type Ref, type RefTo, type Space, type Status } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { getAttributePresenterClass, getClient } from '@hcengineering/presentation'
  import {
    type AnyComponent,
    Component,
    eventToHTMLElement,
    Icon,
    IconClose,
    Label,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import { type Filter, type FilterMode } from '@hcengineering/view'
  import { createEventDispatcher, onDestroy } from 'svelte'
  import view from '../../plugin'
  import { getDocTitle } from '../../utils'
  import ModeSelector from './ModeSelector.svelte'

  export let filter: Filter
  export let space: Ref<Space> | undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()

  const segmentClass =
    'filter-button h-[1.625rem] min-w-7 px-1.5 text-[13px] whitespace-nowrap text-foreground bg-transparent transition-colors duration-150 not-first:border-l not-first:border-border'
  const hoverClass = 'hover:bg-accent hover:text-foreground'
  const conditionClass = 'lower text-muted-foreground'
  const labelClass = 'block max-w-40 truncate'

  let outerMode: FilterMode | undefined
  let innerMode: FilterMode | undefined
  let outerRequestId = 0
  let innerRequestId = 0
  let summaryRequestId = 0
  let valueSummary = ''

  $: activeFilter = filter.nested ?? filter
  $: outerModeId = filter.mode
  $: innerModeId = filter.nested?.mode
  $: hasInnerFilter = filter.nested !== undefined
  $: valueCount = filter.value.length
  $: presenterComponent = findPresenter(activeFilter)
  $: void loadOuterMode(outerModeId)
  $: void loadInnerMode(innerModeId, hasInnerFilter)
  $: void refreshSummary(filter)

  const referencedClass = resolveReferencedClass(filter.nested ?? filter)

  function resolveReferencedClass (source: Filter): Ref<Class<Doc>> | undefined {
    try {
      const attributeType = hierarchy.getAttribute(source.key._class, source.key.key).type
      return (attributeType as RefTo<Doc>).to
    } catch (err) {
      console.error(err)
      return undefined
    }
  }

  function findPresenter (source: Filter): AnyComponent | undefined {
    const { attrClass } = getAttributePresenterClass(hierarchy, source.key.attribute.type)
    return hierarchy.classHierarchyMixin(attrClass, view.mixin.AttributeFilterPresenter)?.presenter
  }

  async function loadOuterMode (modeId: Ref<FilterMode>): Promise<void> {
    const requestId = ++outerRequestId
    outerMode = undefined
    const loaded = await client.findOne(view.class.FilterMode, { _id: modeId })
    if (requestId === outerRequestId) outerMode = loaded
  }

  async function loadInnerMode (modeId: Ref<FilterMode> | undefined, isNested: boolean): Promise<void> {
    const requestId = ++innerRequestId
    innerMode = undefined
    if (!isNested || modeId === undefined) return
    const loaded = await client.findOne(view.class.FilterMode, { _id: modeId })
    if (requestId === innerRequestId) innerMode = loaded
  }

  async function buildSummary (source: Filter): Promise<string> {
    const target = source.nested ?? source
    const language = $themeStore.language
    if (referencedClass === core.class.Status) {
      const statuses = await client.findAll<Status>(referencedClass, { _id: { $in: target.value } }, {})
      const distinctNames = new Set(statuses.map((status) => status.name))
      return await translate(view.string.FilterStatesCount, { value: distinctNames.size }, language)
    }
    const onlyValue = target.value[0]
    if (target.value.length === 1 && referencedClass !== undefined && typeof onlyValue === 'string') {
      const title = await getDocTitle(client, onlyValue, referencedClass).catch(() => undefined)
      if (title !== undefined && title !== '') return title
    }
    return await translate(view.string.NumberItems, { count: target.value.length }, language)
  }

  async function refreshSummary (source: Filter): Promise<void> {
    const requestId = ++summaryRequestId
    const text = await buildSummary(source)
    if (requestId === summaryRequestId) valueSummary = text
  }

  function applyValues (received: Filter): void {
    if (filter.nested !== undefined) {
      filter.nested = received
      filter = filter
    } else {
      filter = received
    }
    dispatch('change')
  }

  function openModePicker (event: MouseEvent, pickerTarget: Filter): void {
    showPopup(ModeSelector, { filter: pickerTarget }, eventToHTMLElement(event), (chosenMode: Ref<FilterMode> | undefined) => {
      if (!chosenMode) return
      pickerTarget.mode = chosenMode
      filter = filter
      dispatch('change')
    })
  }

  function openValueEditor (event: MouseEvent): void {
    const editedFilter = activeFilter
    showPopup(
      editedFilter.key.component,
      { _class: editedFilter.key._class, filter: editedFilter, space, onChange: applyValues },
      eventToHTMLElement(event)
    )
  }

  onDestroy(() => {
    filter.nested?.onRemove?.()
    filter.onRemove?.()
  })
</script>

<div
  class="filter-section inline-flex items-center overflow-hidden mb-0 mr-1.5 last:mr-0 rounded-md border border-border bg-transparent"
>
  <button class="{segmentClass} pl-2 cursor-default" type="button">
    <span class={labelClass}><Label label={filter.key.label} /></span>
  </button>
  <button
    class="{segmentClass} {conditionClass} {hoverClass}"
    type="button"
    data-id="btnCondition"
    on:click={(event) => openModePicker(event, filter)}
  >
    {#if outerMode?.label}
      <span class={labelClass}>
        <Label label={outerMode.selectedLabel ?? outerMode.label} params={{ value: valueCount }} />
      </span>
    {/if}
  </button>
  {#if filter.nested}
    <button class="{segmentClass} {hoverClass}" type="button">
      <span class={labelClass}><Label label={filter.nested.key.label} /></span>
    </button>
    <button
      class="{segmentClass} {conditionClass} {hoverClass}"
      type="button"
      on:click={(event) => openModePicker(event, activeFilter)}
    >
      {#if innerMode?.label}
        <span class={labelClass}>
          <Label label={innerMode.selectedLabel ?? innerMode.label} params={{ value: valueCount }} />
        </span>
      {/if}
    </button>
  {/if}
  {#if outerMode && outerMode.disableValueSelector !== true}
    <button class="{segmentClass} {hoverClass}" type="button" on:click={openValueEditor}>
      {#if presenterComponent}
        <Component
          is={presenterComponent}
          props={{ value: activeFilter.value, onChange: applyValues, filter: activeFilter, space }}
        />
      {:else}
        <span class={labelClass}>{valueSummary}</span>
      {/if}
    </button>
  {/if}
  <div class="divider hidden"></div>
  <button class="{segmentClass} {hoverClass} group w-7 p-0 flex items-center justify-center" type="button" on:click={() => dispatch('remove')}>
    <span class="pointer-events-none flex items-center justify-center text-muted-foreground group-hover:text-foreground">
      <Icon icon={IconClose} size={'small'} />
    </span>
  </button>
</div>
