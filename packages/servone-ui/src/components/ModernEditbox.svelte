<script lang="ts">
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { createEventDispatcher, onMount } from 'svelte'
  import { registerFocus } from '../original'
  import { cn } from '../lib/utils'

  export let label: IntlString
  export let value: string | undefined = undefined
  export let kind: 'default' | 'ghost' | 'secondary' | 'transparent' = 'default'
  export let size: 'small' | 'medium' | 'large' = 'small'
  export let disabled: boolean = false
  export let error: boolean = false
  export let password: boolean = false
  export let limit: number = 0
  export let element: HTMLInputElement | undefined = undefined
  export let autoFocus: boolean = false
  export let autoAction: boolean = true
  export let width: string = ''
  export let style: string = ''
  export let focusIndex: number = -1

  const dispatch = createEventDispatcher<{ blur: string | undefined }>()

  let translatedLabel: string = ''

  $: translateCB(label, {}, $themeStore.language, (text) => {
    translatedLabel = text
  })

  const focusRegistration = registerFocus(focusIndex, {
    focus: () => {
      if (element === undefined) return false
      element.focus()
      return true
    },
    isFocus: () => document.activeElement === element
  })

  let isFocusListenerAttached = false
  $: if (element !== undefined && !isFocusListenerAttached) {
    isFocusListenerAttached = true
    element.addEventListener('focus', () => {
      focusRegistration.focusManager?.setFocus(focusRegistration.idx)
    })
  }

  onMount(() => {
    if (autoFocus && element !== undefined) {
      autoFocus = false
      element.focus()
    }
  })

  function focusInput (): void {
    element?.focus()
  }

  function reportBlur (): void {
    dispatch('blur', value)
  }

  function handleBoxClick (event: Event): void {
    event.stopPropagation()
    if (!autoAction) focusInput()
  }

  $: hasFloatingCaption = kind === 'default' && size === 'large'
  $: placeholder = hasFloatingCaption ? ' ' : translatedLabel
  $: maxLength = limit !== 0 ? limit : undefined
  $: inlineStyle = `${style}${width !== '' ? `;width:${width}` : ''}`
  $: isOutlined = kind === 'default' || kind === 'secondary'
  $: isLarge = size === 'large'
  $: boxSizeClasses = isOutlined
    ? {
        small: 'h-6 px-3 py-1 border border-input rounded-md bg-transparent',
        medium: 'h-8 px-3 py-1.5 border border-input rounded-md bg-transparent',
        large: 'relative h-11 px-3 border border-input rounded-md bg-transparent'
      }[size]
    : isLarge
      ? 'h-6 px-2 py-1 border-0 bg-transparent'
      : 'h-5 px-2 py-1.5 border-0 bg-transparent'
  $: largeBorderlessInputClasses = !isOutlined && isLarge
    ? kind === 'ghost'
      ? '[&_input]:text-2xl [&_input]:font-medium'
      : '[&_input]:text-base [&_input]:font-medium'
    : ''
  $: boxClasses = cn(
    'flex items-center gap-1.5 min-w-0 rounded-md',
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-text focus-within:ring-1 focus-within:ring-ring',
    boxSizeClasses,
    largeBorderlessInputClasses,
    error && 'border-destructive'
  )
  $: inputClasses = cn(
    'w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground',
    hasFloatingCaption && 'h-full pt-3.5 pb-1.5'
  )
</script>

<svelte:element
  this={autoAction ? 'label' : 'div'}
  class={boxClasses}
  style={inlineStyle}
  on:click={handleBoxClick}
>
  {#if size !== 'large' && $$slots.default}
    <slot />
  {/if}
  {#if password}
    <input
      bind:this={element}
      bind:value
      type="password"
      class={inputClasses}
      style={inlineStyle}
      {placeholder}
      {disabled}
      maxlength={maxLength}
      autocomplete="off"
      spellcheck="false"
      on:change
      on:keyup
      on:keydown
      on:input
      on:blur={reportBlur}
    />
  {:else}
    <input
      bind:this={element}
      bind:value
      type="text"
      class={inputClasses}
      style={inlineStyle}
      {placeholder}
      {disabled}
      maxlength={maxLength}
      autocomplete="off"
      spellcheck="false"
      on:change
      on:keyup
      on:keydown
      on:input
      on:blur={reportBlur}
    />
  {/if}
  <slot name="after" />
  {#if hasFloatingCaption}
    <span class="pointer-events-none absolute left-3 top-2.5 text-xs text-muted-foreground transition-all">
      {translatedLabel}
    </span>
  {/if}
</svelte:element>
