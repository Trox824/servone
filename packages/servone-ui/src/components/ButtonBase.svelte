<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import type { ComponentType } from 'svelte'
  import { onMount } from 'svelte'
  import type {
    AnySvelteComponent,
    ButtonBaseKind,
    ButtonBaseSize,
    ButtonBaseType,
    IconSize,
    LabelAndProps
  } from '../original'
  import { tooltip as applyTooltip, registerFocus, Icon, Label, IconAdd, IconSettings, IconClose, IconDelete } from '../original'
  import { LoaderCircle } from '@lucide/svelte'
  import { cn } from '../lib/utils'
  import { buttonVariants } from '../lib/components/ui/button'

  export let title: string | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let icon: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let iconSize: IconSize | undefined = undefined
  export let iconProps: any | undefined = undefined
  export let kind: ButtonBaseKind
  export let size: ButtonBaseSize
  export let disabled: boolean = false
  export let loading: boolean = false
  export let pressed: boolean = false
  export let hasMenu: boolean = false
  // svelte-ignore export_let_unused
  export let noPrint: boolean = false
  export let autoFocus: boolean = false
  // svelte-ignore export_let_unused
  export let noFocus: boolean = false
  export let type: ButtonBaseType
  // svelte-ignore export_let_unused
  export let inheritColor: boolean = false
  // svelte-ignore export_let_unused
  export let inheritFont: boolean = false
  export let tooltip: LabelAndProps | undefined = undefined
  export let element: HTMLButtonElement | undefined = undefined
  export let shape: 'rectangle' | 'round' = 'rectangle'
  export let id: string | undefined = undefined
  export let dataId: string | undefined = undefined
  export let track: string | undefined = undefined
  export let hasSlot: boolean | undefined = undefined
  export let focusIndex: number = -1

  export function focus (): void {
    element?.focus()
  }

  const fallbackNameByIcon = new Map<Asset | AnySvelteComponent | ComponentType, IntlString>([
    [IconAdd, 'presentation:string:Add' as IntlString],
    [IconSettings, 'setting:string:Settings' as IntlString],
    [IconClose, 'presentation:string:Close' as IntlString],
    [IconDelete, 'presentation:string:Delete' as IntlString]
  ])

  function pickVariant (buttonKind: ButtonBaseKind): 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline' {
    switch (buttonKind) {
      case 'primary':
        return 'default'
      case 'secondary':
        return 'secondary'
      case 'tertiary':
      case 'ghost':
        return 'ghost'
      case 'negative':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  function pickBaseSize (buttonSize: ButtonBaseSize): 'lg' | 'default' | 'sm' {
    switch (buttonSize) {
      case 'large':
        return 'lg'
      case 'medium':
        return 'default'
      default:
        return 'sm'
    }
  }

  function pickExtraSizeClass (buttonSize: ButtonBaseSize): string {
    switch (buttonSize) {
      case 'extra-small':
        return 'h-6 text-xs px-2'
      case 'min':
        return 'h-5 px-1.5 text-xs'
      default:
        return ''
    }
  }

  $: hasDefaultContent = hasSlot ?? Boolean($$slots.default)
  $: isIconOnly = !title && !label && Boolean(icon) && !hasDefaultContent
  $: isSquare = type === 'type-button-icon' || isIconOnly
  $: resolvedIconSize =
    iconSize ?? (type === 'type-button' && !hasMenu && iconProps?.size === undefined ? 'medium' : 'small')

  $: nameSource = isIconOnly
    ? tooltip?.label ?? (icon !== undefined ? fallbackNameByIcon.get(icon) : undefined)
    : undefined

  let accessibleName: string | undefined = undefined

  $: if (nameSource !== undefined) {
    translateCB(nameSource, tooltip?.props ?? {}, $themeStore.language, (translated) => {
      accessibleName = translated
    })
  } else {
    accessibleName = undefined
  }

  $: buttonClass = cn(
    buttonVariants({ variant: pickVariant(kind), size: pickBaseSize(size) }),
    pickExtraSizeClass(size),
    shape === 'round' && 'rounded-full',
    isSquare && 'aspect-square p-0',
    pressed && 'bg-accent text-accent-foreground',
    hasMenu && !isSquare && 'pr-1.5'
  )

  const { idx: focusSlot, focusManager } = registerFocus(focusIndex, {
    focus: () => {
      if (!disabled) element?.focus()
      return !disabled && element !== undefined
    },
    isFocus: () => document.activeElement === element
  })

  $: if (focusSlot !== -1 && focusManager !== undefined) focusManager.updateFocus(focusSlot, focusIndex)

  let watchedElement: HTMLButtonElement | undefined = undefined

  function reportFirstFocus (target: HTMLButtonElement | undefined): void {
    if (target === undefined || target === watchedElement) return
    watchedElement = target
    target.addEventListener('focus', () => focusManager?.setFocus(focusSlot), { once: true })
  }

  $: reportFirstFocus(element)

  onMount(() => {
    if (autoFocus && element !== undefined) {
      element.focus()
      autoFocus = false
    }
  })
</script>

<button
  bind:this={element}
  data-slot="button"
  {id}
  data-id={dataId}
  data-track={track}
  class={buttonClass}
  disabled={disabled || loading}
  aria-busy={loading}
  aria-label={accessibleName}
  use:applyTooltip={tooltip}
  on:click|preventDefault|stopPropagation
  on:keydown
>
  {#if loading}
    <span class="pointer-events-none inline-flex shrink-0" aria-hidden="true">
      <LoaderCircle size={14} class="animate-spin" />
    </span>
  {:else if icon !== undefined}
    <span class="pointer-events-none inline-flex shrink-0">
      <Icon {icon} size={resolvedIconSize} {iconProps} />
    </span>
  {/if}
  {#if label !== undefined}
    <span><Label {label} params={labelParams} /></span>
  {/if}
  {#if title !== undefined}
    <span>{title}</span>
  {/if}
  <slot />
</button>
