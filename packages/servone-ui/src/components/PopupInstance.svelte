<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { onDestroy, onMount, tick } from 'svelte'
  import {
    checkAdaptiveMatching,
    deviceOptionsStore,
    fitPopupElement,
    pin,
    resizeObserver,
    testing,
    type AnySvelteComponent,
    type CompAndProps,
    type PopupAlignment,
    type PopupOptions
  } from '../original'
  import { cn } from '../lib/utils'

  export let is: AnySvelteComponent
  export let props: Record<string, unknown>
  export let element: PopupAlignment | undefined
  export let onClose: ((result: unknown) => void) | undefined
  export let onUpdate: ((result: unknown) => void) | undefined
  export let overlay: boolean
  export let zIndex: number
  export let top: boolean
  export let close: () => void
  export let contentPanel: HTMLElement | undefined
  export let popup: CompAndProps

  interface TrackedBox {
    x: number
    y: number
    width: number
    height: number
  }

  interface ContentApi {
    canClose?: () => boolean
    onOutsideClick?: () => void
  }

  type ShowState = 'preShow' | 'startShow' | 'endShow'
  type CloseHow = 'external' | 'close' | 'esc' | 'outside'

  const WINDOW_MARGIN = 1
  const FULL_ON_MOBILE_ALIGNMENTS = ['right', 'top', 'float', 'full', 'content', 'middle', 'centered', 'center', 'full-centered']
  const POSITION_PROPS = ['top', 'bottom', 'left', 'right', 'width', 'height', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight', 'transform']

  function isSubmenuAnchor (target: PopupAlignment | undefined): boolean {
    return typeof target === 'object' && target !== null && 'kind' in target && target.kind === 'submenu'
  }

  function createEmptyOptions (): PopupOptions {
    const emptyPositions: Record<string, string> = {}
    for (const propertyName of POSITION_PROPS) emptyPositions[propertyName] = ''
    return { props: emptyPositions, showOverlay: false, direction: 'bottom' }
  }

  const contentProps = props
  let renderedProps = contentProps
  let isFullSizeMode = Boolean(contentProps.fullSize)
  let isFullSizeState = false
  let options: PopupOptions = createEmptyOptions()
  let showState: ShowState = isSubmenuAnchor(element) ? 'endShow' : 'preShow'

  let frameElement: HTMLDivElement | undefined
  let contentInstance: ContentApi | undefined
  let frameWidth = 0
  let frameHeight = 0

  let trackedBox: TrackedBox = { x: 0, y: 0, width: 0, height: 0 }
  let dragOffsetX = 0
  let dragOffsetY = 0
  let isDragging = false
  let isResizeLocked = false
  let notFitAmount = 0
  let rememberedWindowWidth = 0
  let rememberedWindowHeight = 0
  let trackedFlow: string | undefined
  let isDestroyed = false
  let closeHow: CloseHow = 'external'

  popup.update = (newProps: Record<string, unknown>) => {
    Object.assign(contentProps, newProps)
    renderedProps = contentProps
  }

  $: isSmallScreen = checkAdaptiveMatching($deviceOptionsStore.size, 'md')
  $: isFullOnMobile =
    $deviceOptionsStore.isMobile &&
    $deviceOptionsStore.isPortrait &&
    typeof element === 'string' &&
    FULL_ON_MOBILE_ALIGNMENTS.includes(element)
  $: isCenteredTop = element === 'top' && !isFullOnMobile
  $: displayedShowState = testing ? 'endShow' : showState
  $: isOverlayRendered = overlay || isDragging
  $: hasDimTint = options.showOverlay && !isDragging

  $: if (frameElement) handleFrameAvailable(frameElement)
  $: applyBoxToOptions(trackedBox)
  $: document.body.style.cursor = isDragging ? 'all-scroll' : ''

  function handleFrameAvailable (frame: HTMLDivElement): void {
    frameWidth = frame.clientWidth
    frameHeight = frame.clientHeight
    fitFrame()
    showState = 'startShow'
  }

  function fitFrame (): void {
    if (frameElement == null) return
    const device = $deviceOptionsStore
    let nextOptions: PopupOptions
    if (((isFullSizeMode || isSmallScreen) && (element === 'float' || element === 'centered')) || isFullOnMobile) {
      nextOptions = fitPopupElement(frameElement, device, 'full', contentPanel, frameWidth, frameHeight)
      nextOptions.props.maxHeight = '100vh'
      isFullSizeState = true
    } else {
      const keepsDraggedPlace = element === 'movable' && options.props.top !== undefined && options.props.top !== ''
      nextOptions = keepsDraggedPlace
        ? options
        : fitPopupElement(frameElement, device, element, contentPanel, frameWidth, frameHeight)
      isFullSizeState = false
    }
    nextOptions.fullSize = isFullSizeMode
    if (isCenteredTop) {
      nextOptions.props.left = '0'
      nextOptions.props.right = '0'
      nextOptions.props.transform = ''
    }
    if (element === 'middle' && !isFullSizeState) {
      nextOptions.props.maxHeight = `calc(100vh - ${nextOptions.props.top} - ${nextOptions.props.bottom})`
      nextOptions.props.bottom = ''
    }
    options = nextOptions
  }

  export function fitPopupInstance (): void {
    if (frameElement != null) fitFrame()
  }

  function handleFrameResize (resizedFrame: Element): void {
    frameWidth = resizedFrame.clientWidth
    frameHeight = resizedFrame.clientHeight
    fitFrame()
  }

  function handleTransitionEnd (): void {
    if (showState === 'startShow') showState = 'endShow'
  }

  function closeWithResult (result: unknown, how: CloseHow = 'close'): void {
    closeHow = how
    onClose?.(result)
    options = { ...options, showOverlay: false }
    close()
  }

  function closeOnEscape (how: CloseHow): void {
    if (contentInstance?.canClose?.() === false) return
    closeWithResult(undefined, how)
  }

  function handleWindowKeydown (event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !is || !top) return
    event.preventDefault()
    event.stopPropagation()
    closeOnEscape('esc')
  }

  function handleOverlayClick (): void {
    contentInstance?.onOutsideClick?.()
    closeOnEscape('outside')
  }

  function handleOverlayKeydown (event: KeyboardEvent): void {
    event.preventDefault()
    event.stopPropagation()
  }

  function handleContentUpdate (event: CustomEvent<unknown>): void {
    onUpdate?.(event.detail)
  }

  function handleContentClose (event: CustomEvent<unknown>): void {
    closeWithResult(event.detail)
  }

  function handleContentFullsize (event: CustomEvent<boolean | undefined>): void {
    if (typeof event.detail === 'boolean') isFullSizeMode = event.detail
    fitFrame()
  }

  function handleContentChange (event: CustomEvent<{ notFit?: number } | undefined>): void {
    notFitAmount = event.detail?.notFit ?? 0
    fitFrame()
    if (element === 'movable' && showState !== 'preShow') keepInWindow()
  }

  function applyBoxToOptions (box: TrackedBox): void {
    if (element !== 'movable' || box.width === 0 || box.height === 0) return
    options = {
      ...options,
      props: { ...options.props, left: `${box.x}px`, right: '', top: `${box.y}px`, maxHeight: `${box.height}px` }
    }
  }

  function readBoxFromFrame (): DOMRect | undefined {
    if (frameElement == null) return undefined
    const rect = frameElement.getBoundingClientRect()
    trackedBox = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    return rect
  }

  function handleFrameMouseDown (event: MouseEvent): void {
    if (element !== 'movable') return
    const rect = readBoxFromFrame()
    if (rect === undefined) return
    dragOffsetX = event.clientX - rect.x
    dragOffsetY = event.clientY - rect.y
    isDragging = true
    window.addEventListener('mousemove', handleDragMove)
    window.addEventListener('mouseup', handleDragEnd)
  }

  function handleDragMove (event: MouseEvent): void {
    if (!isDragging) return
    const { docWidth, docHeight } = $deviceOptionsStore
    const maxX = docWidth - WINDOW_MARGIN - trackedBox.width
    const maxY = docHeight - WINDOW_MARGIN - trackedBox.height
    trackedBox = {
      ...trackedBox,
      x: Math.min(Math.max(event.clientX - dragOffsetX, WINDOW_MARGIN), maxX),
      y: Math.min(Math.max(event.clientY - dragOffsetY, WINDOW_MARGIN), maxY)
    }
  }

  function handleDragEnd (): void {
    isDragging = false
    window.removeEventListener('mousemove', handleDragMove)
    window.removeEventListener('mouseup', handleDragEnd)
  }

  function keepInWindow (): void {
    if (frameElement == null) {
      isResizeLocked = false
      return
    }
    const rect = frameElement.getBoundingClientRect()
    if (trackedBox.width === 0 || trackedBox.height === 0) {
      trackedBox = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const { docWidth, docHeight } = $deviceOptionsStore
    let { x, y, width, height } = rect

    if (x < WINDOW_MARGIN) {
      x = WINDOW_MARGIN
    } else if (x + width > rememberedWindowWidth - 2 * WINDOW_MARGIN) {
      x = docWidth - WINDOW_MARGIN - width
    }

    if (y < WINDOW_MARGIN) {
      y = WINDOW_MARGIN
    } else if (y + height > docHeight - WINDOW_MARGIN) {
      y = docHeight - WINDOW_MARGIN - height
    }
    if (y < WINDOW_MARGIN) {
      height -= WINDOW_MARGIN - y
      y = WINDOW_MARGIN
    }
    if (height > rememberedWindowHeight - 2 * WINDOW_MARGIN) {
      height = rememberedWindowHeight - 2 * WINDOW_MARGIN
      y = WINDOW_MARGIN
    }

    let remainingNotFit = notFitAmount
    const freeBelow = Math.max(docHeight - WINDOW_MARGIN - (y + height), 0)
    const grownDown = Math.min(remainingNotFit, freeBelow)
    height += grownDown
    remainingNotFit -= grownDown
    if (remainingNotFit > 0) {
      const freeAbove = Math.max(y - WINDOW_MARGIN, 0)
      const grownUp = Math.min(remainingNotFit, freeAbove)
      y -= grownUp
      height += grownUp
    }

    trackedBox = { x, y, width, height }
    isResizeLocked = false
  }

  function rememberWindowSize (): void {
    rememberedWindowWidth = $deviceOptionsStore.docWidth
    rememberedWindowHeight = $deviceOptionsStore.docHeight
  }

  function handleWindowResize (): void {
    fitFrame()
    if (element !== 'movable' || isResizeLocked) return
    isResizeLocked = true
    if (options.props.right !== '') readBoxFromFrame()
    keepInWindow()
    rememberWindowSize()
  }

  function readFlow (): string | undefined {
    const cardForm = frameElement?.querySelector('form[id]')
    if (cardForm != null && cardForm.id !== '') return cardForm.id
    return frameElement?.querySelector('[data-track]')?.getAttribute('data-track')?.replace(/\.[^.]+$/, '')
  }

  onMount(rememberWindowSize)

  onMount(async () => {
    await tick()
    if (isDestroyed) return
    trackedFlow = readFlow()
    if (trackedFlow !== undefined) Analytics.handleEvent('dialog_opened', { flow: trackedFlow })
  })

  onDestroy(() => {
    isDestroyed = true
    if (trackedFlow !== undefined) Analytics.handleEvent('dialog_closed', { flow: trackedFlow, how: closeHow })
    window.removeEventListener('mousemove', handleDragMove)
    window.removeEventListener('mouseup', handleDragEnd)
    document.body.style.cursor = ''
  })
</script>

<svelte:window on:keydown={handleWindowKeydown} on:resize={handleWindowResize} />

{#if isOverlayRendered}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class={cn(
      'modal-overlay fixed inset-0 h-screen w-full touch-none',
      !testing && 'transition-colors duration-500',
      hasDimTint && 'antiOverlay',
      testing && 'testing'
    )}
    style:z-index={zIndex - 1}
    on:click={handleOverlayClick}
    on:keydown={handleOverlayKeydown}
  ></div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={frameElement}
  id={popup.options.refId}
  class={cn(
    'popup fixed flex max-h-[calc(100vh-32px)] min-h-0 min-w-0 origin-center flex-col rounded-xl border border-border bg-popover text-popover-foreground shadow-lg',
    displayedShowState,
    isFullSizeState && 'fullsize',
    testing && 'testing',
    isCenteredTop && 'mx-auto w-fit'
  )}
  style:z-index={zIndex}
  style:top={options.props.top}
  style:bottom={options.props.bottom}
  style:left={options.props.left}
  style:right={options.props.right}
  style:width={options.props.width}
  style:height={options.props.height}
  style:max-width={options.props.maxWidth}
  style:max-height={options.props.maxHeight}
  style:min-width={options.props.minWidth}
  style:min-height={options.props.minHeight}
  style:transform={options.props.transform}
  data-block-editor-blur="true"
  data-block-cursor-update="true"
  use:resizeObserver={handleFrameResize}
  on:transitionend={handleTransitionEnd}
  on:mousedown={handleFrameMouseDown}
>
  <svelte:component
    this={is}
    bind:this={contentInstance}
    {...renderedProps}
    bind:popupOptions={options}
    on:update={handleContentUpdate}
    on:close={handleContentClose}
    on:fullsize={handleContentFullsize}
    on:dock={() => { pin(popup.id) }}
    on:changeContent={handleContentChange}
  />
</div>

<style>
  .preShow {
    opacity: 0;
    transform: scale(0.9);
  }

  .startShow {
    opacity: 1;
    transform: scale(1);
    transition:
      transform 0.3s cubic-bezier(0, 1.59, 0.26, 1.01),
      opacity 0.3s ease-in-out;
  }

  .endShow {
    opacity: 1;
  }
</style>
