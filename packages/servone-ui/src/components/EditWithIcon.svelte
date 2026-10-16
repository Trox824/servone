<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { type ComponentType, createEventDispatcher } from 'svelte'
  import { Button, Icon, IconClose, Spinner, type AnySvelteComponent } from '../original'
  import ui from '@hcengineering/ui/src/plugin'
  import { cn } from '../lib/utils'

  export let icon: Asset | AnySvelteComponent | ComponentType
  export let width: string | undefined = undefined
  export let value: string | undefined = ''
  export let placeholder: IntlString = ui.string.EditBoxPlaceholder
  export let placeholderParam: any | undefined = undefined
  export let autoFocus: boolean = false
  export let kind: 'ghost' | 'secondary' = 'ghost'
  export let size: 'small' | 'medium' | 'large' = 'medium'
  export let loading: boolean = false

  const dispatch = createEventDispatcher()

  const heightBySize = { small: 'h-6', medium: 'h-8', large: 'h-9' }
  const lookByKind = {
    ghost: 'border-0 bg-transparent hover:bg-accent',
    secondary: 'border border-input bg-transparent'
  }

  let inputElement: HTMLInputElement | undefined
  let translatedPlaceholder = ''

  $: translateCB(placeholder, placeholderParam ?? {}, $themeStore.language, (text) => {
    translatedPlaceholder = text
  })

  $: if (inputElement !== undefined && autoFocus) focus()

  export function focus (): void {
    inputElement?.focus()
    autoFocus = false
  }

  function clearValue (): void {
    value = ''
    dispatch('change', '')
    focus()
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class={cn(
    'flex items-center justify-between gap-2 rounded-md px-1.5 text-foreground',
    heightBySize[size],
    lookByKind[kind]
  )}
  style:width
  on:click={focus}
>
  <div class="mr-2 flex shrink-0 items-center text-muted-foreground">
    <Icon {icon} size={'small'} />
  </div>
  <input
    bind:this={inputElement}
    type="text"
    class="w-full min-w-0 grow bg-transparent text-sm outline-none placeholder:text-muted-foreground"
    bind:value
    placeholder={translatedPlaceholder}
    on:change
    on:input
    on:keydown
  />
  <slot name="extra" />
  <div class="flex items-center shrink-0">
    {#if value !== undefined && value !== ''}
      <div class="ml-2 shrink-0">
        <Button icon={IconClose} kind={'ghost'} size={'small'} noFocus on:click={clearValue} />
      </div>
    {/if}
    {#if loading}
      <div class="ml-1 mr-2">
        <Spinner size={'medium'} />
      </div>
    {/if}
  </div>
</div>
