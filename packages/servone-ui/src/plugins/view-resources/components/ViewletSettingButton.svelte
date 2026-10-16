<script lang="ts">
  import { closeTooltip, showPopup, tooltip } from '@hcengineering/ui'
  import type { BuildModelKey, ViewOptionModel, ViewOptions, Viewlet } from '@hcengineering/view'
  import { SlidersHorizontal } from '@lucide/svelte'
  import { cn } from '../../../lib/utils'
  import { toolbarIconButton } from '../../../lib/search-classes'
  import { intl } from '../../../lib/intl'
  import view from '../plugin'
  import { restrictionStore } from '../utils'
  import { defaultOptions, getViewOptions, viewOptionStore } from '../viewOptions'
  import DisplayPopup from './DisplayPopup.svelte'

  const customizeLabel = intl(view.string.CustomizeView)

  export let kind: 'primary' | 'secondary' | 'tertiary' | 'negative' = 'secondary'
  export let viewOptions: ViewOptions | undefined = undefined
  export let viewlet: Viewlet | undefined = undefined
  export let disabled = false
  export let viewOptionsConfig: ViewOptionModel[] | undefined = undefined
  export let defaultViewOptions: ViewOptions | undefined = undefined
  export let defaultConfig: Array<BuildModelKey | string> | undefined = undefined
  export let showViewOptions = true
  export let hideGroupingAndOrdering = false
  export let hideKeys: string[] = []
  export let showConfigureColumns = true

  $: void kind

  function resolveDefaults (currentViewlet: Viewlet | undefined): ViewOptions {
    if (defaultViewOptions !== undefined && defaultViewOptions !== null) return defaultViewOptions
    const model = currentViewlet?.viewOptions
    if (model === undefined) return defaultOptions
    const modelDefaults: ViewOptions = {
      groupBy: [model.groupBy?.[0] ?? defaultOptions.groupBy[0]],
      orderBy: model.orderBy?.[0] ?? defaultOptions.orderBy
    }
    for (const option of model.other) {
      modelDefaults[option.key] = option.defaultValue
    }
    return modelDefaults
  }

  function computeViewOptions (currentViewlet: Viewlet | undefined, storedOptions: Map<string, ViewOptions>): ViewOptions {
    return getViewOptions(currentViewlet, storedOptions, resolveDefaults(currentViewlet))
  }

  $: viewOptions = computeViewOptions(viewlet, $viewOptionStore)

  $: isShown =
    viewlet !== undefined &&
    ((viewOptions !== undefined && showViewOptions && viewlet.viewOptions !== undefined) || showConfigureColumns)

  $: disabled = $restrictionStore.readonly

  let isPressed = false
  let buttonElement: HTMLButtonElement | undefined

  function openDisplayPopup (): void {
    if (viewlet === undefined || buttonElement === undefined) return
    isPressed = true
    closeTooltip()
    showPopup(
      DisplayPopup,
      {
        viewlet,
        viewOptionsConfig,
        defaultViewOptions,
        defaultConfig,
        showViewOptions,
        showConfigureColumns,
        hideGroupingAndOrdering,
        hideKeys
      },
      buttonElement,
      () => {
        isPressed = false
      }
    )
  }
</script>

{#if isShown}
  <button
    bind:this={buttonElement}
    type="button"
    data-id="btn-viewSetting"
    aria-haspopup="dialog"
    aria-expanded={isPressed}
    {disabled}
    class={cn(toolbarIconButton, isPressed && 'bg-accent text-foreground')}
    aria-label={$customizeLabel}
    use:tooltip={{ label: view.string.CustomizeView, direction: 'bottom' }}
    on:click={openDisplayPopup}
  >
    <SlidersHorizontal size={14} />
  </button>
{/if}
