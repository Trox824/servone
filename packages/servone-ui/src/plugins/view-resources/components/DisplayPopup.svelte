<!--
  "Display" popover, opened by the ViewletSettingButton shadow in place of upstream's ViewOptions /
  ViewletSetting popups and the inline ViewletSelector switcher. Not a Huly shadow.
  Option/property sections follow the CURRENT viewlet (re-resolved after a tab switch), not the one it opened with.
-->
<script lang="ts">
  import core, { Class, Doc, Hierarchy, Ref, SortingOrder, Type } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { Icon, Label, navigate, resizeObserver } from '@hcengineering/ui'
  import { OrderOption, ViewOptionModel, ViewOptions, ViewOptionsModel, Viewlet, BuildModelKey } from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'
  import { activeViewlet, setActiveViewletId } from '../utils'
  import { focusStore } from '../selection'
  import { defaultOptions, getViewOptions, setViewOptions, viewOptionStore } from '../viewOptions'
  import ViewOptionsEditor from './ViewOptions.svelte'
  import { Tabs, TabsList, TabsTrigger } from '../../../lib/components/ui/tabs'
  import ViewletSetting from './ViewletSetting.svelte'
  import { findViewletSwitch, viewletSwitchStore } from './viewletSwitchStore'
  import { extraViewStore } from './extraViewStore'
  import { menuPopupClass } from '../../../lib/menu-classes'

  export let viewlet: Viewlet
  export let viewOptionsConfig: ViewOptionModel[] | undefined = undefined
  export let defaultViewOptions: ViewOptions | undefined = undefined
  export let defaultConfig: (BuildModelKey | string)[] | undefined = undefined
  export let showViewOptions: boolean = true
  export let showConfigureColumns: boolean = true
  export let hideGroupingAndOrdering: boolean = false
  export let hideKeys: string[] = []

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()

  $: entry = findViewletSwitch($viewletSwitchStore, viewlet._id)
  $: current =
    entry !== undefined ? (entry.viewlets.find((v) => v._id === $activeViewlet[entry.key]) ?? viewlet) : viewlet

  function getDefaults (viewOptions: ViewOptionsModel): ViewOptions {
    const res: ViewOptions = {
      groupBy: [viewOptions.groupBy[0] ?? defaultOptions.groupBy[0]],
      orderBy: viewOptions.orderBy?.[0] ?? defaultOptions.orderBy
    }
    for (const opt of viewOptions.other) {
      res[opt.key] = opt.defaultValue
    }
    return res
  }

  function getDefaultOptions (viewlet: Viewlet): ViewOptions {
    if (defaultViewOptions != null) return defaultViewOptions
    return viewlet.viewOptions != null ? getDefaults(viewlet.viewOptions) : defaultOptions
  }

  function getGroupingCustomAttributes (h: Hierarchy, _class: Ref<Class<Doc>>): string[] {
    const customAttributes = [...h.getOwnAttributes(_class).values()]
      .filter(
        (attr) => attr.isCustom && !attr.isHidden && [core.class.RefTo, core.class.EnumOf].includes(attr.type._class)
      )
      .map((a) => a.name)
    return customAttributes
  }

  function getCustomSortingAttributes (h: Hierarchy, _class: Ref<Class<Doc>>): OrderOption[] {
    const sortableTypes: Ref<Class<Type<any>>>[] = [
      core.class.EnumOf,
      core.class.TypeString,
      core.class.TypeNumber,
      core.class.TypeDate,
      core.class.TypeBoolean
    ]

    const customSortableAttributes: OrderOption[] = [...h.getOwnAttributes(_class).values()]
      .filter((attr) => attr.isCustom && !attr.isHidden && sortableTypes.includes(attr.type._class))
      .map((a) => {
        return [a.name, SortingOrder.Ascending]
      })
    return customSortableAttributes
  }

  function buildConfig (viewlet: Viewlet): ViewOptionsModel | undefined {
    if (viewlet.viewOptions === undefined) return undefined
    const config = hierarchy.clone(viewlet.viewOptions) as ViewOptionsModel
    if (viewOptionsConfig !== undefined) {
      config.other = viewOptionsConfig
    }
    const customAttributes = getGroupingCustomAttributes(hierarchy, viewlet.attachTo)
    const customSort = getCustomSortingAttributes(hierarchy, viewlet.attachTo)
    config.orderBy = Array.from(new Set([...config.orderBy, ...customSort]))
    config.groupBy = Array.from(new Set([...config.groupBy, ...customAttributes]))
    return config
  }

  $: config = buildConfig(current)
  $: viewOptions = getViewOptions(current, $viewOptionStore, getDefaultOptions(current))

  function onUpdate (e: CustomEvent<{ key: string, value: any }>): void {
    const result = e.detail
    if (result?.key === undefined) return
    const next = { ...viewOptions, [result.key]: result.value }
    focusStore.set({})
    setViewOptions(current, next)
    dispatch('update', result)
  }

  $: extraView = $extraViewStore
  $: isExtraActive = extraView?.isActive === true
  $: hasOptions = showViewOptions && config !== undefined && !isExtraActive
  $: hasTabs = entry !== undefined && entry.viewlets.length + (extraView === undefined ? 0 : 1) > 1
  $: selectedTab = isExtraActive && extraView !== undefined ? extraView.id : current._id

  function switchViewlet (value: string): void {
    if (value === '' || value === selectedTab) return
    if (extraView !== undefined && value === extraView.id) {
      extraView.open()
      dispatch('close')
      return
    }
    if (isExtraActive && extraView !== undefined) {
      const records = extraView.recordsLocation()
      setActiveViewletId(value as Ref<Viewlet>, records)
      navigate(records)
      dispatch('close')
      return
    }
    setActiveViewletId(value as Ref<Viewlet>)
  }
</script>

<div class="servone-display-popup {menuPopupClass} w-[20rem] gap-0 p-2" use:resizeObserver={() => dispatch('changeContent')}>
  {#if hasTabs && entry !== undefined}
    <Tabs value={selectedTab} onValueChange={switchViewlet} class="w-full">
      <!-- auto-fit drops empty tracks so 2-4 tiles fill the row; 5+ viewlets wrap instead of clipping at 20rem. -->
      <TabsList
        class="group-data-horizontal/tabs:h-auto grid w-full grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-1"
      >
        {#each entry.viewlets as v (v._id)}
          <TabsTrigger value={v._id} class="h-auto min-w-0 flex-col gap-1 px-1 py-1.5 text-xs">
            {#if v.$lookup?.descriptor?.icon}
              <Icon icon={v.$lookup.descriptor.icon} size={'small'} />
            {/if}
            <span class="w-full truncate text-center">
              {#if v.title}{v.title}{:else if v.$lookup?.descriptor?.label}<Label label={v.$lookup.descriptor.label} />{/if}
            </span>
          </TabsTrigger>
        {/each}
        {#if extraView !== undefined}
          <TabsTrigger value={extraView.id} class="h-auto min-w-0 flex-col gap-1 px-1 py-1.5 text-xs">
            <svelte:component this={extraView.icon} size={16} />
            <span class="w-full truncate text-center"><Label label={extraView.label} /></span>
          </TabsTrigger>
        {/if}
      </TabsList>
    </Tabs>
  {/if}
  {#if hasOptions && config !== undefined}
    {#if hasTabs}<div class="my-2 h-px bg-border" />{/if}
    <!-- keyed on the viewlet: ViewOptions builds its group/order lists once, at mount -->
    {#key current._id}
      <ViewOptionsEditor
        viewlet={current}
        {config}
        viewOptions={hierarchy.clone(viewOptions)}
        {hideGroupingAndOrdering}
        {hideKeys}
        embedded
        on:update={onUpdate}
      />
    {/key}
  {/if}
  {#if showConfigureColumns && !isExtraActive}
    {#if hasTabs || hasOptions}<div class="my-2 h-px bg-border" />{/if}
    {#key current._id}
      <ViewletSetting viewlet={current} {defaultConfig} embedded on:changeContent />
    {/key}
  {/if}
</div>

<style lang="scss">
  /* The popup frame is pinned with top and bottom, so it stretches past the card and leaves an empty strip. */
  :global(.popup:has(.servone-display-popup)) {
    bottom: auto !important;
  }
</style>
