<script context="module" lang="ts">
  let isFullScreenModeActive = false

  export function getFullScreenMode (): boolean {
    return isFullScreenModeActive
  }
</script>

<script lang="ts">
  import { onDestroy } from 'svelte'
  import { modalStore, popupstore, type CompAndProps } from '../original'
  import PopupInstance from './PopupInstance.svelte'

  export let contentPanel: HTMLElement | undefined = undefined
  export let fullScreen: boolean = false

  const POPUP_BASE_Z_INDEX = 10000
  const frameByPopupId: Record<string, PopupInstance | null> = {}

  if (fullScreen) isFullScreenModeActive = true

  onDestroy(() => {
    if (fullScreen) isFullScreenModeActive = false
  })

  function isShownByThisHost (popup: CompAndProps, isFullScreenHost: boolean, isModeActive: boolean): boolean {
    if (popup.dock === true) return false
    const isFullCentered = popup.element === 'full-centered'
    if (isModeActive) return isFullScreenHost !== isFullCentered
    return !isFullScreenHost
  }

  export function fitPopupInstance (): void {
    for (const frame of Object.values(frameByPopupId)) frame?.fitPopupInstance()
  }

  $: shownPopups = $popupstore.filter((popup) => isShownByThisHost(popup, fullScreen, getFullScreenMode()))

  function stackIndexOf (popupId: string, entries: typeof $modalStore): number {
    return entries.findIndex((entry) => entry.type === 'popup' && entry.id === popupId)
  }
</script>

{#if $popupstore.length > 0}
  <slot name="popup-header" />
{/if}

{#each shownPopups as popup, position (popup.id)}
  <PopupInstance
    bind:this={frameByPopupId[popup.id]}
    is={popup.is}
    props={popup.props}
    element={popup.element}
    onClose={popup.onClose}
    onUpdate={popup.onUpdate}
    close={popup.close}
    overlay={popup.options.overlay}
    {popup}
    {contentPanel}
    zIndex={POPUP_BASE_Z_INDEX + stackIndexOf(popup.id, $modalStore)}
    top={position === $popupstore.length - 1}
  />
{/each}
