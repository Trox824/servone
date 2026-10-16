<script lang="ts">
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { afterUpdate, createEventDispatcher, onMount } from 'svelte'
  import ui, {
    Button,
    IconDownOutline,
    IconUpOutline,
    floorFractionDigits,
    registerFocus,
    resizeObserver
  } from '../original'
  import { cn } from '../lib/utils'

  export let maxWidth: string | undefined = undefined
  export let value: number | undefined
  export let minValue: number | undefined = undefined
  export let maxValue: number | undefined = undefined
  export let placeholder: IntlString = ui.string.EditBoxPlaceholder
  export let placeholderParam: Record<string, unknown> | undefined = undefined
  export let maxDigitsAfterPoint: number | undefined = undefined
  export let disabled: boolean = false
  export let autoFocus: boolean = false
  export let select: boolean = false
  export let focusable: boolean = false
  export let focusIndex: number = -1

  const DEFAULT_INPUT_WIDTH = '5rem'
  const dispatch = createEventDispatcher<{ change: undefined, input: undefined }>()

  let inputElement: HTMLInputElement | undefined
  let rootElement: HTMLElement | undefined
  let parentWidth: number | undefined
  let translatedPlaceholder = ''

  const { idx: focusSlot, focusManager } = registerFocus(focusIndex, {
    focus: () => {
      inputElement?.focus()
      return inputElement != null
    },
    isFocus: () => document.activeElement === inputElement
  })

  $: if (maxDigitsAfterPoint !== undefined && value) {
    const allowedForm = new RegExp(`^\\d*\\.?\\d{0,${maxDigitsAfterPoint}}$`)
    if (!allowedForm.test(String(value))) value = floorFractionDigits(value, maxDigitsAfterPoint)
  }

  $: {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      dispatch('change')
    } else if (minValue === undefined || maxValue === undefined || maxValue >= minValue) {
      if (minValue !== undefined && value < minValue) value = minValue
      if (maxValue !== undefined && value > maxValue) value = maxValue
      dispatch('change')
    }
  }

  $: translateCB(placeholder, placeholderParam ?? {}, $themeStore.language, (text: string) => {
    translatedPlaceholder = text
  })

  $: inputMaxWidth = maxWidth ?? (parentWidth !== undefined ? `${parentWidth}px` : 'max-content')

  function applyInputWidth (): void {
    if (inputElement != null) inputElement.style.width = maxWidth ?? DEFAULT_INPUT_WIDTH
  }

  function stepBy (delta: number): void {
    value = (value ?? 0) + delta
    dispatch('change')
  }

  function handleNativeInput (): void {
    applyInputWidth()
    dispatch('input')
  }

  function trackParentWidth (): void {
    parentWidth = rootElement?.parentElement?.clientWidth
  }

  export function focusInput (): void {
    inputElement?.focus()
  }

  export function selectInput (): void {
    inputElement?.select()
  }

  export function focus (): void {
    inputElement?.focus()
  }

  onMount(() => {
    applyInputWidth()
    dispatch('input')
    if (autoFocus) {
      inputElement?.focus()
      autoFocus = false
    }
    if (select) {
      inputElement?.select()
      select = false
    }
  })

  afterUpdate(() => {
    applyInputWidth()
    dispatch('input')
  })
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={rootElement}
  class="inline-flex w-max flex-col items-start rounded-md border border-input py-0 pl-2 pr-0.5"
  use:resizeObserver={trackParentWidth}
  on:click={() => inputElement?.focus()}
>
  <div class={cn('flex min-w-0 items-center', focusable && 'rounded-md ring-1 ring-ring')}>
    <input
      bind:this={inputElement}
      type="number"
      class="m-0 min-w-0 border-0 bg-transparent p-0 text-sm text-foreground outline-none [appearance:textfield] disabled:text-muted-foreground [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
      style:max-width={inputMaxWidth}
      placeholder={translatedPlaceholder}
      {disabled}
      bind:value
      on:focus|once={() => focusManager?.setFocus(focusSlot)}
      on:input={handleNativeInput}
      on:change
      on:keydown
      on:keypress
      on:blur
    />
    <div class="flex flex-col items-center py-0.5">
      <Button icon={IconUpOutline} kind="stepper" padding="0" {disabled} on:click={() => { stepBy(1) }} />
      <Button icon={IconDownOutline} kind="stepper" padding="0" {disabled} on:click={() => { stepBy(-1) }} />
    </div>
  </div>
</div>
