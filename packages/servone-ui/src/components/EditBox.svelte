<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { afterUpdate, createEventDispatcher, onMount } from 'svelte'
  import { registerFocus, floorFractionDigits, Label, type EditStyle } from '../original'
  import ui from '@hcengineering/ui/src/plugin'
  import { cn } from '../lib/utils'

  export let id: string | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let maxWidth: string = '100%'
  export let value: string | number | undefined = undefined
  export let placeholder: IntlString = ui.string.EditBoxPlaceholder
  export let placeholderParam: any | undefined = undefined
  export let format: 'text' | 'password' | 'number' | 'text-multiline' = 'text'
  export let maxDigitsAfterPoint: number | undefined = undefined
  export let minValue: number | undefined = undefined
  export let maxValue: number | undefined = undefined
  export let formatter: ((value: string | number) => string | number) | undefined = undefined
  export let kind: EditStyle = 'editbox'
  export let autoFocus: boolean = false
  export let select: boolean = false
  export let focusable: boolean = false
  export let disabled: boolean = false
  export let fullSize: boolean = false
  export let required: boolean = false
  export let uppercase: boolean = false
  export let propagateClick: boolean = false
  export let shrink: boolean = false
  export let focusIndex: number = -1

  const dispatch = createEventDispatcher()

  const boxClassByKind: Record<EditStyle, string> = {
    editbox: 'h-8 rounded-md border border-input bg-transparent px-2.5 text-sm',
    default: 'h-8 rounded-md border border-input bg-transparent px-2.5 text-sm',
    'small-style': 'h-6 rounded-sm border border-input bg-transparent px-2 text-xs',
    'large-style': 'border-0 bg-transparent px-0 text-2xl font-semibold',
    'default-large': 'h-10 rounded-md border border-input bg-transparent px-3 text-base',
    ghost: 'h-8 rounded-md border-0 bg-transparent px-2 text-sm hover:bg-accent',
    'ghost-large': 'h-10 rounded-md border-0 bg-transparent px-3 text-base hover:bg-accent',
    'modern-ghost-large': 'h-11 rounded-lg border-0 bg-transparent px-3 text-lg font-medium hover:bg-accent',
    'search-style': 'h-8 rounded-md border-0 bg-transparent px-1 text-sm',
    underline: 'border-0 border-b border-input rounded-none bg-transparent px-1 text-sm'
  }
  const MIN_SHRINK_WIDTH_PX = 50 // keeps an empty shrinking field clickable
  const UNDERLINE_EXTRA_WIDTH = '1.125rem'

  let fieldElement: HTMLInputElement | HTMLTextAreaElement | undefined
  let measureElement: HTMLSpanElement | undefined
  let focusListenerTarget: HTMLInputElement | HTMLTextAreaElement | undefined
  let translatedPlaceholder = ''

  const focusRegistration = registerFocus(focusIndex, {
    focus: () => {
      if (fieldElement === undefined) return false
      fieldElement.focus()
      return true
    },
    isFocus: () => document.activeElement === fieldElement
  })

  $: if (format === 'number' && maxDigitsAfterPoint !== undefined && typeof value === 'number' && value !== 0) {
    value = floorFractionDigits(value, maxDigitsAfterPoint)
  } else if (formatter !== undefined && value !== undefined && value !== null) {
    value = formatter(value)
  }

  $: translateCB(placeholder, placeholderParam ?? {}, $themeStore.language, (text) => {
    translatedPlaceholder = text
  })

  $: if (fieldElement !== undefined && fieldElement !== focusListenerTarget) {
    focusListenerTarget = fieldElement
    fieldElement.addEventListener('focus', () => {
      focusRegistration.focusManager?.setFocus(focusRegistration.idx)
    })
  }

  $: boxClass = cn(
    'flex items-center min-w-0',
    boxClassByKind[kind],
    uppercase && 'uppercase',
    focusable && 'focus-within:ring-1 focus-within:ring-ring',
    disabled && 'opacity-50 cursor-not-allowed',
    fullSize && 'w-full'
  )
  $: outerClass = cn('inline-flex flex-col items-start min-w-0', fullSize && 'grow', (focusable || fullSize) && 'w-full')

  export function focusInput (): void {
    fieldElement?.focus()
  }

  export function selectInput (): void {
    fieldElement?.select()
  }

  export function focus (): void {
    fieldElement?.focus()
  }

  function applyAutoWidth (currentText: string): void {
    if (!shrink || fieldElement === undefined || measureElement === undefined) return
    measureElement.textContent = currentText === '' ? translatedPlaceholder : currentText
    const measuredWidth = measureElement.getBoundingClientRect().width
    if (format === 'number') {
      fieldElement.style.width = maxWidth
    } else if (kind === 'underline') {
      fieldElement.style.width = `calc(${measuredWidth}px + ${UNDERLINE_EXTRA_WIDTH})`
    } else {
      fieldElement.style.width = `${Math.max(measuredWidth, MIN_SHRINK_WIDTH_PX)}px`
    }
  }

  function clampToBounds (): void {
    if (format !== 'number' || typeof value !== 'number') return
    if (minValue !== undefined && maxValue !== undefined && maxValue < minValue) return
    if (minValue !== undefined && value < minValue) value = minValue
    if (maxValue !== undefined && value > maxValue) value = maxValue
    dispatch('value', value)
  }

  function onNumberChange (): void {
    clampToBounds()
    dispatch('change', value)
  }

  function onBlur (): void {
    clampToBounds()
    dispatch('blur', value)
  }

  function onInput (): void {
    applyAutoWidth(fieldElement?.value ?? '')
    dispatch('input')
    dispatch('value', value)
  }

  function onOuterClick (event: MouseEvent): void {
    if (!propagateClick) event.stopPropagation()
    fieldElement?.focus()
  }

  onMount(() => {
    if (autoFocus) {
      fieldElement?.focus()
      autoFocus = false
    }
    if (select) {
      fieldElement?.select()
      select = false
    }
    applyAutoWidth(String(value ?? ''))
  })

  afterUpdate(() => {
    applyAutoWidth(String(value ?? ''))
  })

  const fieldClass =
    'w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed [font:inherit]'
  const numberFieldClass =
    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  {id}
  class={outerClass}
  style:width={maxWidth}
  on:mousedown|stopPropagation
  on:click={onOuterClick}
>
  {#if label}
    <div class="mb-1 text-sm font-medium text-foreground select-text">
      <Label {label} />{#if required}<span class="text-destructive"> *</span>{/if}
    </div>
  {/if}
  <div class={boxClass} style:width={maxWidth}>
    {#if format === 'text-multiline'}
      <div class="autogrow-cell" data-value={value ?? ''}>
        <textarea
          rows="1"
          bind:this={fieldElement}
          class={cn(fieldClass, 'resize-none overflow-hidden')}
          style:width={maxWidth}
          {disabled}
          placeholder={translatedPlaceholder}
          bind:value
          on:input={onInput}
          on:change
          on:keydown
          on:keypress
          on:blur={onBlur}
        ></textarea>
      </div>
    {:else if format === 'password'}
      <input
        id="userPassword"
        type="password"
        bind:this={fieldElement}
        class={fieldClass}
        style:width={maxWidth}
        {disabled}
        placeholder={translatedPlaceholder}
        bind:value
        on:input={onInput}
        on:change
        on:keydown
        on:keypress
        on:blur={onBlur}
      />
    {:else if format === 'number'}
      <input
        type="number"
        min={minValue}
        max={maxValue}
        bind:this={fieldElement}
        class={cn(fieldClass, numberFieldClass)}
        style:width={maxWidth}
        {disabled}
        placeholder={translatedPlaceholder}
        bind:value
        on:input={onInput}
        on:change={onNumberChange}
        on:keydown
        on:keypress
        on:blur={onBlur}
      />
    {:else}
      <input
        type="text"
        bind:this={fieldElement}
        class={fieldClass}
        style:width={maxWidth}
        {disabled}
        placeholder={translatedPlaceholder}
        bind:value
        on:input={onInput}
        on:change
        on:keydown
        on:keypress
        on:blur={onBlur}
      />
    {/if}
  </div>
  <span bind:this={measureElement} class="absolute invisible whitespace-pre text-sm"></span>
</div>

<style>
  .autogrow-cell {
    display: grid;
    width: 100%;
    min-width: 0;
  }
  .autogrow-cell::after {
    content: attr(data-value) ' ';
    visibility: hidden;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .autogrow-cell > textarea,
  .autogrow-cell::after {
    grid-area: 1 / 1 / 2 / 2;
    font: inherit;
    padding: 0;
    border: 0;
  }
</style>
