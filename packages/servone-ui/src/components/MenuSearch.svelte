<!--
  Native <input> so on:change / on:input / on:keydown stay DOM forwards. Negative margins make it
  full-bleed inside menuPopupClass (p-1).
-->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { Search, X } from '@lucide/svelte'
  import { createEventDispatcher } from 'svelte'
  import uiPlugin from '@hcengineering/ui/src/plugin'

  const CLEAR_SEARCH = 'ui:string:ServoneClearSearch' as IntlString

  export let value: string | undefined = ''
  export let placeholder: IntlString = uiPlugin.string.SearchDots
  export let placeholderParam: any | undefined = undefined
  export let autoFocus: boolean = false

  const dispatch = createEventDispatcher()
  let input: HTMLInputElement
  let phTranslate: string = ''

  export function focus (): void {
    input?.focus()
    autoFocus = false
  }

  $: translateCB(placeholder, placeholderParam ?? {}, $themeStore.language, (res) => {
    phTranslate = res
  })
  let clearLabel = ''
  $: translateCB(CLEAR_SEARCH, {}, $themeStore.language, (res) => {
    clearLabel = res
  })
  $: if (input !== undefined && autoFocus) focus()
</script>

<label class="-mx-1 -mt-1 mb-1 flex h-9 shrink-0 cursor-text items-center gap-2 border-b border-border px-3 text-foreground">
  <Search size={14} class="shrink-0 text-muted-foreground" />
  <input
    bind:this={input}
    type="text"
    class="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
    bind:value
    placeholder={phTranslate}
    autocomplete="off"
    spellcheck="false"
    on:change
    on:input
    on:keydown
  />
  {#if value}
    <button
      type="button"
      class="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label={clearLabel}
      tabindex="-1"
      on:click={() => {
        value = ''
        dispatch('change', '')
        input?.focus()
      }}
    >
      <X size={12} />
    </button>
  {/if}
</label>
