<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import type { ComponentType } from 'svelte'
  import { onDestroy, onMount } from 'svelte'
  import { checkAdaptiveMatching, deviceOptionsStore, registerFocus, tooltip, Icon, Label } from '../original'
  import type {
    AnySvelteComponent,
    ButtonKind,
    ButtonShape,
    ButtonSize,
    IconProps,
    LabelAndProps,
    WidthType
  } from '../original'
  import { LoaderCircle } from '@lucide/svelte'
  import { cn } from '../lib/utils'
  import { buttonVariants } from '../lib/components/ui/button'

  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let kind: ButtonKind = 'regular'
  export let size: ButtonSize = 'medium'
  export let shape: ButtonShape = undefined
  export let icon: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let iconProps: IconProps = {}
  export let iconRight: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let iconRightProps: IconProps = {}
  export let justify: 'left' | 'center' = 'center'
  export let padding: string | undefined = undefined
  export let disabled: boolean = false
  export let loading: boolean = false
  export let width: string | undefined = undefined
  export let minWidth: string | undefined = undefined
  export let height: string | undefined = undefined
  // svelte-ignore export_let_unused
  export let resetIconSize: 'none' | 'icon' | 'full' = 'none'
  export let highlight: boolean = false
  export let pressed: boolean = false
  export let selected: boolean = false
  // svelte-ignore export_let_unused
  export let notSelected: boolean = false
  export let focus: boolean = false
  export let click: boolean = false
  export let title: string | undefined = undefined
  // svelte-ignore export_let_unused
  export let borderStyle: 'solid' | 'dashed' | 'none' = 'solid'
  export let id: string | undefined = undefined
  export let dataId: string | undefined = undefined
  export let track: string | undefined = undefined
  export let input: HTMLButtonElement | undefined = undefined
  export let showTooltip: LabelAndProps | undefined = undefined
  // svelte-ignore export_let_unused
  export let short: boolean = false
  export let shrink: number = 0
  export let flex: string | undefined = undefined
  export let accent: boolean = false
  // svelte-ignore export_let_unused
  export let noFocus: boolean = false
  // svelte-ignore export_let_unused
  export let noPrint: boolean = false
  export let adaptiveShrink: WidthType | null = null
  // svelte-ignore export_let_unused
  export let gap: 'medium' | 'large' = 'medium'
  export let stopPropagation: boolean = true
  // svelte-ignore export_let_unused
  export let event: string | undefined = undefined
  export let focusIndex: number = -1

  function pickVariant (
    buttonKind: ButtonKind
  ): 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' {
    switch (buttonKind) {
      case 'primary':
      case 'positive':
      case 'contrast':
        return 'default'
      case 'secondary':
        return 'secondary'
      case 'negative':
      case 'dangerous':
        return 'destructive'
      case 'ghost':
      case 'icon':
      case 'no-border':
      case 'link':
      case 'list':
      case 'list-header':
        return 'ghost'
      default:
        return 'outline'
    }
  }

  function pickBaseSize (buttonSize: ButtonSize): 'sm' | 'default' | 'lg' {
    switch (buttonSize) {
      case 'inline':
      case 'x-small':
      case 'small':
        return 'sm'
      case 'large':
      case 'x-large':
        return 'lg'
      default:
        return 'default'
    }
  }

  function pickExtraSizeClass (buttonSize: ButtonSize): string {
    switch (buttonSize) {
      case 'inline':
      case 'x-small':
        return 'h-6 text-xs px-2'
      case 'x-large':
        return 'h-10 px-5'
      default:
        return ''
    }
  }

  function pickRoundingClass (buttonShape: ButtonShape): string {
    switch (buttonShape) {
      case 'circle':
      case 'round':
      case 'round2':
      case 'round-small':
        return 'rounded-full'
      case 'rectangle-left':
        return 'rounded-r-none'
      case 'rectangle-right':
        return 'rounded-l-none'
      default:
        return ''
    }
  }

  $: isSpelledOut =
    kind === 'primary' &&
    shape === 'round' &&
    !label &&
    Boolean(icon) &&
    showTooltip?.label !== undefined &&
    showTooltip.component === undefined

  $: shownLabel = isSpelledOut ? showTooltip?.label : label
  $: shownLabelParams = isSpelledOut ? {} : labelParams
  $: shownTooltip = isSpelledOut ? undefined : showTooltip
  $: shownShape = isSpelledOut ? undefined : shape

  $: hasIconSlot = Boolean($$slots.icon)
  $: hasIconRightSlot = Boolean($$slots.iconRight)
  $: hasContentSlot = Boolean($$slots.content)
  $: isIconOnly =
    !shownLabel && !hasContentSlot && Boolean(icon || iconRight || hasIconSlot || hasIconRightSlot)

  let accessibleName: string | undefined = undefined

  $: if (isIconOnly && shownTooltip?.label !== undefined) {
    translateCB(shownTooltip.label, shownTooltip.props ?? {}, $themeStore.language, (translated) => {
      accessibleName = translated
    })
  } else {
    accessibleName = undefined
  }

  let currentDeviceSize: WidthType | null = null
  const stopWatchingDevice = deviceOptionsStore.subscribe((options: { size: WidthType | null }) => {
    currentDeviceSize = options.size
  })
  onDestroy(stopWatchingDevice)

  $: isLabelHidden = adaptiveShrink !== null && checkAdaptiveMatching(currentDeviceSize, adaptiveShrink)

  $: leadingIconSize = isSpelledOut ? 'small' : iconProps.size ?? (size === 'inline' ? 'inline' : 'small')

  $: stateName = selected ? 'selected' : pressed ? 'pressed' : undefined

  $: buttonClass = cn(
    buttonVariants({ variant: pickVariant(kind), size: isSpelledOut ? 'sm' : pickBaseSize(size) }),
    pickExtraSizeClass(size),
    pickRoundingClass(shownShape),
    kind === 'positive' && 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600/90',
    isIconOnly && 'aspect-square p-0',
    (highlight || pressed || selected) && kind !== 'positive' && 'bg-accent text-accent-foreground',
    justify === 'left' && 'justify-start text-left',
    noFocus && 'focus-visible:ring-0 focus-visible:ring-offset-0',
    accent && 'font-semibold',
    isLabelHidden && 'sr-only'
  )

  const { idx: focusSlot, focusManager } = registerFocus(focusIndex, {
    focus: () => {
      if (!disabled) input?.focus()
      return !disabled && input !== undefined
    },
    isFocus: () => document.activeElement === input
  })

  $: if (focusSlot !== -1 && focusManager !== undefined) focusManager.updateFocus(focusSlot, focusIndex)

  let watchedInput: HTMLButtonElement | undefined = undefined

  function reportFirstFocus (target: HTMLButtonElement | undefined): void {
    if (target === undefined || target === watchedInput) return
    watchedInput = target
    target.addEventListener('focus', () => focusManager?.setFocus(focusSlot), { once: true })
  }

  $: reportFirstFocus(input)

  onMount(() => {
    if (input === undefined) return
    const swallowClick = (clickEvent: MouseEvent): void => {
      if (!stopPropagation) return
      clickEvent.preventDefault()
      clickEvent.stopPropagation()
    }
    input.addEventListener('click', swallowClick)
    if (focus) {
      input.focus()
      focus = false
    }
    if (click) {
      input.click()
      click = false
    }
    return () => input?.removeEventListener('click', swallowClick)
  })
</script>

<button
  bind:this={input}
  data-slot="button"
  {id}
  data-id={dataId}
  data-track={track}
  class={buttonClass}
  type={kind === 'primary' ? 'submit' : 'button'}
  disabled={disabled || loading}
  aria-busy={loading}
  aria-pressed={pressed || selected}
  aria-label={accessibleName}
  data-state={stateName}
  {title}
  style:min-width={minWidth}
  style:width
  style:height
  style:flex
  style:flex-shrink={shrink}
  style:padding={isIconOnly ? undefined : padding}
  use:tooltip={shownTooltip}
  on:click
  on:focus
  on:blur
  on:mousemove
  on:mouseleave
>
  {#if icon !== undefined && !loading}
    <span class="pointer-events-none inline-flex shrink-0">
      <Icon {icon} size={leadingIconSize} {iconProps} />
    </span>
  {/if}
  {#if loading}
    <span class="pointer-events-none inline-flex shrink-0" aria-hidden="true">
      <LoaderCircle size={14} class="animate-spin" />
    </span>
  {/if}
  {#if shownLabel && !isLabelHidden}
    <span class="overflow-hidden text-ellipsis whitespace-nowrap pointer-events-none">
      <Label label={shownLabel} params={shownLabelParams} />
    </span>
  {/if}
  {#if iconRight !== undefined}
    <span class="pointer-events-none inline-flex shrink-0">
      <Icon icon={iconRight} size={iconRightProps.size ?? 'x-small'} iconProps={iconRightProps} />
    </span>
  {/if}
  <slot name="icon" />
  <slot name="content" />
  <slot name="iconRight" />
</button>
