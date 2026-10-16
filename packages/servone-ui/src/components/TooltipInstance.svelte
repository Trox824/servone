<script context="module" lang="ts">
  let isFullScreenHostMounted = false

  export function getFullScreenMode (): boolean {
    return isFullScreenHostMounted
  }
</script>

<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from 'svelte'
  import {
    Label,
    resizeObserver,
    closeTooltip,
    tooltipstore,
    modalStore,
    popupstore,
    capitalizeFirstLetter,
    formatKey,
    testing
  } from '../original'
  import type { TooltipAlignment } from '../original'
  import Component from './Component.svelte'

  export let fullScreen: boolean = false

  const EDGE_MARGIN = 8
  const VERTICAL_SAFETY = 28
  const HOVER_BRIDGE = 12
  const CENTERED_STYLE =
    'top: 50%; left: 50%; transform: translate(-50%, -50%); width: min-content; height: min-content;'

  let viewportWidth = 0
  let viewportHeight = 0

  let cardElement: HTMLElement | null = null
  let bubbleElement: HTMLElement | null = null
  let submenuElement: HTMLElement | null = null

  let cardStyle = ''
  let arrowStyle = ''
  let bubbleStyle = ''
  let submenuStyle = ''
  let isCardShown = false
  let isBubbleHidden = true
  let isSubmenuShown = false
  let isCentered = false
  let cardSide: TooltipAlignment = 'bottom'
  let bubbleSide: TooltipAlignment = 'top'
  let observedCardWidth = 0
  let observedSubmenuWidth = 0
  let previousPopupCount = $popupstore.length

  function readRequest () {
    return $tooltipstore
  }

  function isDormant (): boolean {
    return fullScreen !== isFullScreenHostMounted
  }

  $: canRenderSurfaces = $tooltipstore !== undefined && fullScreen === (document.fullscreenElement != null)
  $: stackLevel = 10000 + $modalStore.findIndex((entry) => entry.type === 'tooltip')
  $: isSubmenu = $tooltipstore.kind === 'submenu'
  $: isRichCard = $tooltipstore.component !== undefined && !isSubmenu
  $: isLabelBubble = !isRichCard && $tooltipstore.label !== undefined && !isSubmenu
  $: referencedComponent = typeof $tooltipstore.component === 'string' ? $tooltipstore.component : undefined
  $: hostedComponent = typeof $tooltipstore.component === 'string' ? undefined : $tooltipstore.component
  $: bubbleAlignStyle = $tooltipstore.textAlign !== undefined ? `text-align: ${$tooltipstore.textAlign};` : ''
  $: isCardModern = $tooltipstore.style === 'modern'
  $: cardChrome = isCardModern
    ? 'p-0 border-0 rounded-3xl'
    : $tooltipstore.label !== undefined
      ? 'p-4 border rounded-xl'
      : 'p-2 border rounded-xl'

  function forwardUpdate (event: CustomEvent) {
    const onUpdate = readRequest().onUpdate
    if (onUpdate !== undefined) onUpdate(event)
  }

  function replaceRequest (event: CustomEvent<Partial<ReturnType<typeof readRequest>>>) {
    const merged = { ...readRequest(), ...event.detail }
    modalStore.update((entries) => [...entries.filter((entry) => entry.type !== 'tooltip'), merged])
  }

  function formatChip (keyGroup: string[]): string {
    return keyGroup.map((part) => capitalizeFirstLetter(part.trim())).join(' + ')
  }

  function isEmptyRect (rect: DOMRect): boolean {
    return rect.x === 0 && rect.y === 0 && rect.width === 0 && rect.height === 0
  }

  function clamp (target: number, lower: number, upper: number): number {
    return Math.min(Math.max(target, lower), upper)
  }

  function placeCard (card: HTMLElement, trigger: HTMLElement) {
    const triggerRect = trigger.getBoundingClientRect()
    if (isEmptyRect(triggerRect)) {
      isCardShown = false
      return
    }
    const previousHeight = card.style.height
    card.style.height = ''
    const cardHeight = card.offsetHeight
    card.style.height = previousHeight
    const cardWidth = observedCardWidth > 0 ? observedCardWidth : card.clientWidth

    const spaceAbove = triggerRect.top
    const spaceBelow = viewportHeight - triggerRect.bottom
    const gap = '5px + 0.25rem'
    let verticalStyle: string

    if (triggerRect.bottom + cardHeight + VERTICAL_SAFETY < viewportHeight) {
      cardSide = 'bottom'
      verticalStyle = `top: calc(${triggerRect.bottom}px + ${gap});`
    } else if (spaceAbove > spaceBelow) {
      cardSide = 'top'
      verticalStyle = `bottom: calc(${viewportHeight - triggerRect.top}px + ${gap});`
      if (cardHeight > spaceAbove - VERTICAL_SAFETY) {
        verticalStyle += ` top: 1rem; height: calc(${spaceAbove}px - 5px - 1.25rem);`
      }
    } else {
      cardSide = 'bottom'
      verticalStyle = `top: calc(${triggerRect.bottom}px + ${gap});`
      if (cardHeight > spaceBelow - VERTICAL_SAFETY) {
        verticalStyle = `bottom: 1rem; height: calc(${spaceBelow}px - 5px - 1.25rem);`
      }
    }

    const centredLeft = triggerRect.left + triggerRect.width / 2 - cardWidth / 2
    let horizontalStyle = `left: ${centredLeft}px;`
    if (centredLeft + cardWidth > viewportWidth - EDGE_MARGIN) {
      horizontalStyle = 'right: 0.5rem;'
    } else if (centredLeft < EDGE_MARGIN) {
      horizontalStyle = 'left: 0.5rem;'
    }

    cardStyle = `${verticalStyle} ${horizontalStyle}`
    arrowStyle = `top: ${triggerRect.top}px; left: ${triggerRect.left}px; width: ${triggerRect.width}px; height: ${triggerRect.height}px;`
    isCardShown = true
  }

  function measureNaturalWidth (bubble: HTMLElement): number {
    const previousMaxWidth = bubble.style.maxWidth
    bubble.style.maxWidth = ''
    const naturalWidth = bubble.getBoundingClientRect().width
    bubble.style.maxWidth = previousMaxWidth
    return naturalWidth
  }

  function placeBubble (bubble: HTMLElement, trigger: HTMLElement, anchor: HTMLElement | undefined) {
    const triggerRect = trigger.getBoundingClientRect()
    const anchorRect = (anchor ?? trigger).getBoundingClientRect()
    if (isEmptyRect(triggerRect)) {
      isBubbleHidden = true
      return
    }

    const requestedSide = readRequest().direction
    let side: TooltipAlignment
    if (requestedSide !== undefined) {
      side = requestedSide
    } else if (anchorRect.right < viewportWidth / 5) {
      side = 'right'
    } else if (anchorRect.left > (viewportWidth * 4) / 5) {
      side = 'left'
    } else if (anchorRect.top < bubble.offsetHeight) {
      side = 'bottom'
    } else {
      side = 'top'
    }
    bubbleSide = side

    const anchorCenterY = anchorRect.top + anchorRect.height / 2
    if (side === 'right') {
      const roomRight = Math.min(viewportWidth / 2, viewportWidth - anchorRect.right)
      bubbleStyle = `top: ${anchorCenterY}px; left: calc(${anchorRect.right}px + 0.75rem); transform: translateY(-50%); max-width: calc(${roomRight}px - 1.5rem);`
    } else if (side === 'left') {
      const roomLeft = Math.min(viewportWidth / 2, anchorRect.left)
      bubbleStyle = `top: ${anchorCenterY}px; right: calc(${viewportWidth - anchorRect.left}px + 0.75rem); transform: translateY(-50%); max-width: calc(${roomLeft}px - 1.5rem);`
    } else {
      const halfWidth = Math.min(measureNaturalWidth(bubble), viewportWidth - 2 * EDGE_MARGIN) / 2
      const centerX = clamp(
        anchorRect.left + anchorRect.width / 2,
        EDGE_MARGIN + halfWidth,
        viewportWidth - EDGE_MARGIN - halfWidth
      )
      const verticalStyle =
        side === 'bottom'
          ? `top: calc(${anchorRect.bottom}px + 0.5rem);`
          : `bottom: calc(${viewportHeight - anchorRect.top}px + 0.75rem);`
      bubbleStyle = `${verticalStyle} left: ${centerX}px; transform: translateX(-50%); max-width: calc(${viewportWidth}px - 1rem);`
    }
    isBubbleHidden = false
  }

  function placeFloating (hasContent: boolean) {
    const request = readRequest()
    if (cardElement === null) observedCardWidth = 0
    if (!hasContent) {
      isCardShown = false
      isBubbleHidden = true
      return
    }
    isCentered = request.element === undefined
    if (isCentered) {
      cardStyle = CENTERED_STYLE
      bubbleStyle = CENTERED_STYLE
      isCardShown = true
      isBubbleHidden = false
      return
    }
    if (cardElement != null) placeCard(cardElement, request.element)
    if (bubbleElement != null) placeBubble(bubbleElement, request.element, request.anchor)
  }

  function placeSubmenu (hasContent: boolean) {
    const request = readRequest()
    if (submenuElement == null) return
    if (!hasContent) {
      isSubmenuShown = false
      return
    }
    if (request.element === undefined) return
    const triggerRect = request.element.getBoundingClientRect()
    const panelWidth = observedSubmenuWidth > 0 ? observedSubmenuWidth : submenuElement.clientWidth
    const panelHeight = submenuElement.offsetHeight
    const roomRight = viewportWidth - triggerRect.right
    let horizontalStyle = `left: ${triggerRect.right - 4}px;`
    if (triggerRect.right - 4 + panelWidth + 16 > viewportWidth && triggerRect.left > roomRight) {
      horizontalStyle = `right: ${viewportWidth - triggerRect.left - 4}px;`
    }
    let verticalStyle = `top: ${triggerRect.top - 4}px;`
    if (
      triggerRect.top - 4 + panelHeight + 16 > viewportHeight &&
      triggerRect.bottom > viewportHeight - triggerRect.top
    ) {
      verticalStyle = `bottom: ${viewportHeight - triggerRect.bottom - 4}px;`
    }
    submenuStyle = `${horizontalStyle} ${verticalStyle}`
    isSubmenuShown = true
  }

  function placeAll () {
    if (isDormant()) return
    const request = readRequest()
    const hasContent = request.label !== undefined || request.component !== undefined
    placeFloating(hasContent)
    placeSubmenu(hasContent)
  }

  function recordCardSize (element: Element) {
    observedCardWidth = element.clientWidth
    placeAll()
  }

  function recordSubmenuSize (element: Element) {
    observedSubmenuWidth = element.clientWidth
  }

  function dismiss () {
    if (isDormant()) return
    isCardShown = false
    isBubbleHidden = true
    isSubmenuShown = false
    closeTooltip()
  }

  function findActiveSurface (): HTMLElement | null {
    const request = readRequest()
    if (request.kind === 'submenu') return submenuElement
    return request.component !== undefined ? cardElement : bubbleElement
  }

  function isPointerWithin (rect: DOMRect, pointerX: number, pointerY: number, extraAbove = 0, extraBelow = 0): boolean {
    return (
      pointerX >= rect.left &&
      pointerX <= rect.right &&
      pointerY >= rect.top - extraAbove &&
      pointerY <= rect.bottom + extraBelow
    )
  }

  function onWindowResize () {
    if (readRequest().kind !== 'popup') dismiss()
  }

  function onPointerMove (event: MouseEvent) {
    if (isDormant()) return
    const request = readRequest()
    const surface = findActiveSurface()
    if (request.element === undefined || surface == null) return
    if (request.kind === 'popup') return

    const surfaceRect = surface.getBoundingClientRect()
    const placedSide = request.component !== undefined ? cardSide : bubbleSide
    const isOverTrigger = isPointerWithin(request.element.getBoundingClientRect(), event.clientX, event.clientY)
    const bridgeAbove = request.kind !== 'submenu' && placedSide === 'bottom' ? HOVER_BRIDGE : 0
    const bridgeBelow = request.kind !== 'submenu' && placedSide === 'top' ? HOVER_BRIDGE : 0
    const isOverSurface = isPointerWithin(surfaceRect, event.clientX, event.clientY, bridgeAbove, bridgeBelow)
    const isLabelOnly = request.component === undefined && request.kind !== 'submenu'

    if ((isLabelOnly && !isOverTrigger) || (!isOverTrigger && !isOverSurface)) dismiss()
  }

  function onPointerDownCapture (event: PointerEvent) {
    const request = readRequest()
    const hasContent = request.label !== undefined || request.component !== undefined
    if (request.kind !== 'tooltip' || !hasContent) return
    const surface = findActiveSurface()
    if (event.target instanceof Node && surface != null && surface.contains(event.target)) return
    dismiss()
  }

  function onKeyDown (event: KeyboardEvent) {
    if (event.key !== 'Escape' || isDormant()) return
    const request = readRequest()
    const hasContent = request.label !== undefined || request.component !== undefined
    if (!hasContent || request.kind === 'popup') return
    const isHoverOverDialog = request.kind === 'tooltip' && $popupstore.length > 0
    dismiss()
    if (isHoverOverDialog) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function onPopupCountChange (popupCount: number) {
    if (popupCount === previousPopupCount) return
    previousPopupCount = popupCount
    if (readRequest().kind === 'tooltip') dismiss()
  }

  $: if ($tooltipstore !== undefined) placeAll()
  $: onPopupCountChange($popupstore.length)

  afterUpdate(placeAll)

  onMount(() => {
    if (fullScreen) isFullScreenHostMounted = true
  })

  onDestroy(() => {
    dismiss()
    if (fullScreen) isFullScreenHostMounted = false
  })
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
  on:resize={onWindowResize}
  on:mousemove={onPointerMove}
  on:pointerdown|capture={onPointerDownCapture}
  on:keydown={onKeyDown}
/>

{#if !fullScreen}
  <svg class="svg-mask pointer-events-none absolute size-0" aria-hidden="true">
    <clipPath id="nub-bg" clipPathUnits="userSpaceOnUse">
      <path
        d="M0 7V6C3.6 6 5.6 4.6 7.3 1.4C7.9 0.4 8.4 0 9 0C9.6 0 10.1 0.4 10.7 1.4C12.4 4.6 14.4 6 18 6V7Z"
      />
    </clipPath>
    <clipPath id="nub-border" clipPathUnits="userSpaceOnUse">
      <path
        d="M0 6C3.6 6 5.6 4.6 7.3 1.4C7.9 0.4 8.4 0 9 0C9.6 0 10.1 0.4 10.7 1.4C12.4 4.6 14.4 6 18 6V7C13.9 7 11.8 5.4 10.1 2.3C9.8 1.7 9.5 1 9 1C8.5 1 8.2 1.7 7.9 2.3C6.2 5.4 4.1 7 0 7Z"
      />
    </clipPath>
  </svg>
{/if}

{#if canRenderSurfaces}
  {#if $tooltipstore.kind === 'popup'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="antiOverlay pointer-events-auto fixed top-0 left-0 h-screen w-full touch-none bg-transparent"
      style="z-index: {stackLevel};"
      on:click|stopPropagation|preventDefault={() => closeTooltip()}
      on:keydown|stopPropagation|preventDefault={() => {}}
    ></div>
  {/if}

  {#if isRichCard}
    {#if !isCentered && $tooltipstore.noArrow !== true}
      <div
        class="nub fade {cardSide}"
        class:shown={isCardShown}
        class:instant={testing}
        style="z-index: {stackLevel}; {arrowStyle}"
      ></div>
    {/if}
    <div
      bind:this={cardElement}
      class="popup-tooltip fade fixed flex max-w-[60vw] flex-col overflow-hidden border-border bg-popover text-foreground select-none {cardChrome} {$tooltipstore.style ??
        'default'}"
      class:no-arrow={isCentered}
      class:shown={isCardShown}
      class:instant={testing}
      style="z-index: {stackLevel}; {cardStyle}"
      use:resizeObserver={recordCardSize}
    >
      {#if $tooltipstore.label !== undefined}
        <div class="fs-title mb-4">
          <Label label={$tooltipstore.label} params={$tooltipstore.props ?? {}} />
        </div>
      {/if}
      {#if referencedComponent !== undefined}
        <Component is={referencedComponent} props={$tooltipstore.props} on:update={forwardUpdate} />
      {:else if hostedComponent !== undefined}
        <svelte:component
          this={hostedComponent}
          {...$tooltipstore.props}
          on:update={forwardUpdate}
          on:tooltip={replaceRequest}
        />
      {/if}
    </div>
  {:else if isLabelBubble}
    <div
      bind:this={bubbleElement}
      class="tooltip fixed flex items-center rounded-sm border border-border bg-popover p-2 text-center text-xs text-popover-foreground select-none {bubbleSide}"
      class:no-arrow={isCentered}
      style="z-index: {stackLevel}; {bubbleStyle} visibility: {isBubbleHidden ? 'hidden' : 'visible'};"
    >
      {#if $tooltipstore.label !== undefined}
        <span class="min-w-0 break-words {$tooltipstore.keys === undefined ? 'w-full' : ''}" style={bubbleAlignStyle}>
          <Label label={$tooltipstore.label} params={$tooltipstore.props ?? {}} />
        </span>
      {/if}
      {#if $tooltipstore.keys !== undefined}
        <div class="ml-2 flex shrink-0 items-center gap-0.5">
          {#each $tooltipstore.keys as keyText, keyIndex}
            {#if keyIndex > 0}
              <span class="mx-1">/</span>
            {/if}
            {#each formatKey(keyText) as keyGroup}
              <span class="min-w-6 rounded-xs bg-muted p-1 text-xs">{formatChip(keyGroup)}</span>
            {/each}
          {/each}
        </div>
      {/if}
    </div>
  {:else if isSubmenu}
    <div
      bind:this={submenuElement}
      class="submenu-container fixed h-auto w-auto rounded-lg"
      style="z-index: {stackLevel}; {submenuStyle} visibility: {isSubmenuShown ? 'visible' : 'hidden'};"
      use:resizeObserver={recordSubmenuSize}
    >
      {#if referencedComponent !== undefined}
        <Component is={referencedComponent} props={$tooltipstore.props} on:update={forwardUpdate} />
      {:else if hostedComponent !== undefined}
        <svelte:component this={hostedComponent} {...$tooltipstore.props} on:update={forwardUpdate} />
      {/if}
    </div>
  {/if}
{/if}

<style>
  .fade {
    opacity: 0;
    transition: opacity 0.1s ease-in-out;
  }
  .fade.shown {
    opacity: 1;
    transition: opacity 0.1s ease-in-out 0.05s;
  }
  .fade.instant {
    transition: none;
  }

  .popup-tooltip {
    border-style: solid;
    box-shadow: var(--theme-popup-shadow);
  }
  .popup-tooltip.modern {
    outline: none;
    box-shadow:
      0 2px 5px rgb(0 0 0 / 5%),
      0 5px 12px rgb(0 0 0 / 6%),
      0 12px 28px rgb(0 0 0 / 8%),
      0 24px 50px rgb(0 0 0 / 10%),
      0 48px 80px rgb(0 0 0 / 12%),
      0 100px 100px rgb(0 0 0 / 15%);
  }
  .popup-tooltip.no-arrow,
  .tooltip.no-arrow {
    box-shadow: 0 0 20px rgb(0 0 0 / 75%);
  }
  .tooltip {
    box-shadow: var(--theme-popup-shadow);
  }

  .nub {
    position: fixed;
    pointer-events: none;
    user-select: none;
  }
  .nub::before,
  .nub::after {
    content: '';
    position: absolute;
    width: 18px;
    height: 7px;
    left: 50%;
    margin-left: -9px;
  }
  .nub::before {
    background: var(--popover);
    clip-path: url('#nub-bg');
    z-index: 1;
  }
  .nub::after {
    background: var(--border);
    clip-path: url('#nub-border');
    z-index: 2;
  }
  .nub.bottom::before,
  .nub.bottom::after {
    top: calc(100% + 0.25rem);
  }
  .nub.top::before,
  .nub.top::after {
    bottom: calc(100% + 0.25rem);
    transform: rotate(180deg);
  }
  .nub.left::before,
  .nub.left::after {
    left: -0.25rem;
    margin-left: 0;
    top: 50%;
    margin-top: -9px;
    transform-origin: left top;
    transform: rotate(90deg);
  }
  .nub.right::before,
  .nub.right::after {
    left: calc(100% + 0.25rem - 18px);
    margin-left: 0;
    top: 50%;
    margin-top: -9px;
    transform-origin: right top;
    transform: rotate(-90deg);
  }
</style>
