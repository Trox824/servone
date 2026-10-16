<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, afterUpdate } from 'svelte'
  import { ChevronLeft, Maximize2, Minimize2, X } from '@lucide/svelte'
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import ui, { deviceOptionsStore, resizeObserver, type HeaderAdaptive, popupstore } from '../original'
  import { cn } from '../lib/utils'
  import { showListPage } from '../lib/phone-nav'

  export let type: 'type-aside' | 'type-popup' | 'type-component' | 'type-panel' = 'type-component'
  export let adaptive: HeaderAdaptive = 'default'
  export let allowFullsize: boolean = false
  export let hideSeparator: boolean = false
  export let topIndent: boolean = false
  export let hideBefore: boolean = false
  export let hideDescription: boolean = false
  export let hideSearch: boolean = false
  export let hideActions: boolean = false
  export let hideExtra: boolean = false
  export let hidePresence: boolean = false
  export let overflowExtra: boolean = false
  export let shrinkSearch: boolean = false
  export let singleRow: boolean = false
  export let noPrint: boolean = false
  export let freezeBefore: boolean = false
  export let doubleRowWidth: number = 768
  export let closeOnEscape: boolean = true
  export let realWidth: number | undefined = undefined

  const dispatch = createEventDispatcher<{
    close: undefined
    resize: {
      headerWidth: number
      extraWidth: number
      spaceWidth: number
      titleWidth: number
      titleOverflow: boolean
      extraOverflow: boolean
    }
  }>()

  const SQUEEZED_SPACER_MAX_WIDTH = 16
  const UNSQUEEZE_MARGIN = 42

  const measurements = {
    titleWidth: 0,
    titleOverflow: false,
    extraWidth: 0,
    extraOverflow: false,
    spaceWidth: 0
  }

  const dividerClass = 'h-5 w-px shrink-0 bg-border print:hidden'
  const iconButtonClass =
    'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring print:hidden'
  const backButtonClass =
    'servone-header-back flex size-9 shrink-0 items-center justify-center rounded-md text-foreground outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring print:hidden'
  const escHintClass =
    'rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground print:hidden'

  const hasCloseButton = type === 'type-popup' || type === 'type-aside'

  let isNarrow = false
  let isExtraSqueezed = false
  let fullsizeLabel = ''
  let backLabel = ''
  let closeLabel = ''

  $: isNavigatorVisible = $deviceOptionsStore.navigator.visible
  $: isMobile = $deviceOptionsStore.isMobile
  $: isToolbarMode = type === 'type-component' && $$slots.search && !hideSearch && !singleRow
  $: isTwoRow =
    isToolbarMode ||
    adaptive === 'doubleRow' ||
    (adaptive !== 'disabled' && isNarrow) ||
    (adaptive === 'autoExtra' && (isNarrow || isExtraSqueezed))
  $: isPage = type === 'type-component'
  $: rowHeightClass = isPage ? 'h-12' : 'h-11'
  $: hasActions = $$slots.actions && !hideActions
  $: hasDescription = $$slots.description && !hideDescription
  $: isActionsInTitleRow =
    isToolbarMode || adaptive === 'freezeActions' || adaptive === 'doubleRow' || adaptive === 'autoExtra'
  $: isExtraInToolbar = adaptive === 'doubleRow' || adaptive === 'autoExtra'
  $: showFullsizeButton = allowFullsize && !isMobile
  $: showBackButton =
    !showFullsizeButton &&
    isPage &&
    isMobile &&
    $deviceOptionsStore.navigator.available &&
    !isNavigatorVisible

  $: rootClass = cn(
    'servone-header flex shrink-0 gap-2 bg-background',
    topIndent && 'pt-2',
    noPrint && 'print:hidden',
    isTwoRow
      ? 'flex-col gap-0'
      : ['items-center px-4', rowHeightClass, !hideSeparator && 'border-b border-border']
  )
  $: titleRowClass = cn(
    'servone-header-row flex items-center gap-2 border-b border-border px-4',
    rowHeightClass
  )
  $: toolbarRowClass = cn(
    'flex items-center gap-2 px-4 print:hidden',
    isToolbarMode
      ? ['min-h-11 gap-1.5 py-1.5', !shrinkSearch && 'flex-wrap']
      : ['h-10', $$slots.search ? 'justify-between' : 'flex-row-reverse']
  )
  $: titleBlockClass = cn(
    'servone-header-title flex min-w-0 items-center gap-1',
    adaptive !== 'autoExtra' && 'flex-1',
    hasDescription && 'flex-col items-start'
  )

  $: translateCB(
    isNavigatorVisible ? ui.string.NormalSize : ui.string.FullSize,
    {},
    $themeStore.language,
    (text) => {
      fullsizeLabel = text
    }
  )
  $: translateCB('workbench:string:ServoneBackToList' as IntlString, {}, $themeStore.language, (text) => {
    backLabel = text
  })
  $: translateCB('presentation:string:Close' as IntlString, {}, $themeStore.language, (text) => {
    closeLabel = text
  })

  function measureRoot (element: HTMLElement): void {
    realWidth = element.clientWidth
    isNarrow = realWidth <= doubleRowWidth
  }

  function measureTitle (element: HTMLElement): void {
    measurements.titleWidth = element.clientWidth
    measurements.titleOverflow = element.scrollWidth > element.clientWidth
  }

  function measureExtra (element: HTMLElement): void {
    measurements.extraWidth = element.clientWidth
    measurements.extraOverflow = element.scrollWidth > element.clientWidth
  }

  function measureSpacer (element: HTMLElement): void {
    measurements.spaceWidth = element.clientWidth
    if (!isTwoRow) {
      if (measurements.spaceWidth <= SQUEEZED_SPACER_MAX_WIDTH) isExtraSqueezed = true
    } else if (measurements.spaceWidth > measurements.extraWidth + UNSQUEEZE_MARGIN) {
      isExtraSqueezed = false
    }
  }

  function toggleNavigator (): void {
    deviceOptionsStore.update((options) => ({
      ...options,
      navigator: { ...options.navigator, visible: !options.navigator.visible }
    }))
  }

  function handleWindowKeydown (event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !closeOnEscape) return
    event.preventDefault()
    event.stopPropagation()
    if (type === 'type-aside' && $popupstore.length > 0) return
    dispatch('close')
  }

  onMount(() => {
    if (hasCloseButton) window.addEventListener('keydown', handleWindowKeydown)
  })

  onDestroy(() => {
    window.removeEventListener('keydown', handleWindowKeydown)
  })

  afterUpdate(() => {
    dispatch('resize', { headerWidth: realWidth ?? 0, ...measurements })
  })
</script>

<div class={rootClass} use:resizeObserver={measureRoot}>
  {#if isTwoRow}
    <div class={titleRowClass}>
      {#if showFullsizeButton}
        <button type="button" class={iconButtonClass} aria-label={fullsizeLabel} on:click={toggleNavigator}>
          {#if isNavigatorVisible}
            <Maximize2 class="size-4" />
          {:else}
            <Minimize2 class="size-4" />
          {/if}
        </button>
        <div class={dividerClass}></div>
      {:else if showBackButton}
        <button type="button" class={backButtonClass} aria-label={backLabel} on:click={showListPage}>
          <ChevronLeft class="size-5" />
        </button>
      {/if}
      {#if !isPage && $$slots.beforeTitle && !hideBefore}
        <div class={cn('mr-2 flex items-center gap-1.5 print:hidden', freezeBefore && 'sticky left-0')}>
          <slot name="beforeTitle" doubleRow={isNarrow} />
        </div>
      {/if}
      <div class={titleBlockClass} use:resizeObserver={measureTitle} on:click>
        <div class="hulyHeader-titleGroup flex min-w-0 shrink items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <slot doubleRow={isNarrow} />
        </div>
        {#if hasDescription}
          <div class="flex min-w-0 shrink items-center gap-1 text-xs text-muted-foreground">
            <slot name="description" />
          </div>
        {/if}
      </div>
      {#if adaptive === 'autoExtra'}
        <div class="flex-1" use:resizeObserver={measureSpacer}></div>
      {/if}
      {#if isPage && !isToolbarMode && $$slots.beforeTitle && !hideBefore}
        <div class="flex items-center gap-1.5 print:hidden">
          <slot name="beforeTitle" doubleRow={isNarrow} />
        </div>
      {/if}
      {#if hasActions && isActionsInTitleRow}
        <div class="flex shrink-0 items-center gap-1 print:hidden">
          <slot name="actions" doubleRow={isNarrow} />
        </div>
      {/if}
      {#if hasCloseButton}
        {#if type !== 'type-popup'}
          <div class={dividerClass}></div>
        {/if}
        {#if closeOnEscape && !isMobile}
          <span class={escHintClass}>Esc</span>
        {/if}
        <button type="button" class={iconButtonClass} aria-label={closeLabel} on:click={() => dispatch('close')}>
          <X class="size-4" />
        </button>
      {/if}
    </div>
    <div class={toolbarRowClass}>
      {#if $$slots.presence && !hidePresence}
        <div class="flex items-center gap-1.5 print:hidden">
          <slot name="presence" doubleRow={isNarrow} />
        </div>
      {/if}
      {#if isToolbarMode}
        {#if $$slots.extra && !hideExtra}
          <div
            class={cn('flex min-w-0 items-center gap-1.5', overflowExtra && 'overflow-hidden')}
            use:resizeObserver={measureExtra}
          >
            <slot name="extra" doubleRow={isNarrow} />
          </div>
        {/if}
        <div class="ml-auto flex shrink-0 items-center gap-2 print:hidden">
          <div class={cn('flex items-center gap-2', shrinkSearch && 'min-w-0 shrink')}>
            <slot name="search" doubleRow={isNarrow} />
          </div>
          {#if $$slots.beforeTitle && !hideBefore}
            <div class="flex items-center gap-2">
              <slot name="beforeTitle" doubleRow={isNarrow} />
            </div>
          {/if}
        </div>
      {:else}
        {#if $$slots.search}
          <div class={cn('flex items-center gap-1.5 print:hidden', shrinkSearch && 'min-w-0 shrink')}>
            <slot name="search" doubleRow={isNarrow} />
          </div>
        {/if}
        {#if isExtraInToolbar && $$slots.extra && !hideExtra}
          <div
            class={cn('flex items-center gap-1.5', overflowExtra && 'overflow-hidden', shrinkSearch && 'shrink-0')}
            use:resizeObserver={measureExtra}
          >
            <slot name="extra" doubleRow={isNarrow} />
          </div>
        {/if}
        {#if hasActions && !isActionsInTitleRow}
          <div class="flex shrink items-center gap-1 print:hidden">
            <slot name="actions" doubleRow={isNarrow} />
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    {#if showFullsizeButton}
      <button type="button" class={iconButtonClass} aria-label={fullsizeLabel} on:click={toggleNavigator}>
        {#if isNavigatorVisible}
          <Maximize2 class="size-4" />
        {:else}
          <Minimize2 class="size-4" />
        {/if}
      </button>
      <div class={dividerClass}></div>
    {:else if showBackButton}
      <button type="button" class={backButtonClass} aria-label={backLabel} on:click={showListPage}>
        <ChevronLeft class="size-5" />
      </button>
    {/if}
    {#if !isPage && $$slots.beforeTitle && !hideBefore}
      <div class="mr-2 flex items-center gap-1.5 print:hidden">
        <slot name="beforeTitle" doubleRow={isNarrow} />
      </div>
    {/if}
    <div class={titleBlockClass} use:resizeObserver={measureTitle} on:click>
      <div class="hulyHeader-titleGroup flex min-w-0 shrink items-center gap-1.5 text-[15px] font-semibold text-foreground">
        <slot doubleRow={isNarrow} />
      </div>
      {#if hasDescription}
        <div class="flex min-w-0 shrink items-center gap-1 text-xs text-muted-foreground">
          <slot name="description" />
        </div>
      {/if}
    </div>
    {#if adaptive === 'autoExtra'}
      <div class="flex-1" use:resizeObserver={measureSpacer}></div>
    {/if}
    {#if $$slots.presence && !hidePresence}
      <div class="flex items-center gap-1.5 print:hidden">
        <slot name="presence" doubleRow={isNarrow} />
      </div>
    {/if}
    {#if isPage && $$slots.beforeTitle && !hideBefore}
      <div class="flex items-center gap-1.5 print:hidden">
        <slot name="beforeTitle" doubleRow={isNarrow} />
      </div>
    {/if}
    {#if $$slots.search && !hideSearch}
      <div class="flex items-center gap-1.5 print:hidden">
        <slot name="search" doubleRow={isNarrow} />
      </div>
      {#if hasActions}
        <div class={dividerClass}></div>
      {/if}
    {/if}
    {#if $$slots.extra && !hideExtra}
      <div
        class={cn('flex items-center gap-1.5', overflowExtra && 'overflow-hidden')}
        use:resizeObserver={measureExtra}
      >
        <slot name="extra" doubleRow={isNarrow} />
      </div>
    {/if}
    {#if hasActions}
      <div class="flex items-center gap-1 print:hidden">
        <slot name="actions" doubleRow={isNarrow} />
      </div>
    {/if}
    {#if hasCloseButton}
      {#if type !== 'type-popup'}
        <div class={dividerClass}></div>
      {/if}
      {#if closeOnEscape && !isMobile}
        <span class={escHintClass}>Esc</span>
      {/if}
      <button type="button" class={iconButtonClass} aria-label={closeLabel} on:click={() => dispatch('close')}>
        <X class="size-4" />
      </button>
    {/if}
  {/if}
</div>
