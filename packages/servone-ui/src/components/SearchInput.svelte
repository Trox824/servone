<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import type { IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { Search, X } from '@lucide/svelte'
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import uiPlugin from '@hcengineering/ui/src/plugin'
  import { cn } from '../lib/utils'
  import { searchClear, searchInput, searchShell } from '../lib/search-classes'

  export let value: string | undefined = undefined
  export let placeholder: IntlString = uiPlugin.string.Search
  export let placeholderParam: any | undefined = undefined
  export let collapsed: boolean = false
  export let autoFocus: boolean = false
  export let width: string | undefined = undefined
  export let delay: number = 500

  const dispatch = createEventDispatcher<{ change: string | undefined }>()
  const clearLabelId = 'ui:string:ServoneClearSearch' as IntlString

  let inputElement: HTMLInputElement | undefined
  let draftText: string | undefined = value
  let pendingTimer: ReturnType<typeof setTimeout> | undefined
  let placeholderText = ''
  let clearLabelText = ''

  $: draftText = value
  $: hasText = draftText !== undefined && draftText !== ''
  $: translateCB(placeholder, placeholderParam ?? {}, $themeStore.language, (text: string) => {
    placeholderText = text
  })
  $: translateCB(clearLabelId, {}, $themeStore.language, (text: string) => {
    clearLabelText = text
  })

  function cancelPending (): void {
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer)
      pendingTimer = undefined
    }
  }

  function publishNow (): void {
    cancelPending()
    if (draftText !== undefined && draftText !== '' && draftText !== value) Analytics.handleEvent('list_searched', {})
    value = draftText
    dispatch('change', draftText)
  }

  function schedulePublish (): void {
    cancelPending()
    pendingTimer = setTimeout(publishNow, delay)
  }

  function clearText (): void {
    draftText = ''
    publishNow()
    inputElement?.focus()
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      publishNow()
    } else if (event.key === 'Escape' && hasText) {
      event.preventDefault()
      clearText()
    }
  }

  onMount(() => {
    if (autoFocus) {
      autoFocus = false
      inputElement?.focus()
    }
  })

  onDestroy(cancelPending)
</script>

<label class={cn(searchShell)} style:width>
  <Search size={13} class="shrink-0 text-muted-foreground" />
  <input
    bind:this={inputElement}
    bind:value={draftText}
    type="text"
    class={searchInput}
    autocomplete="off"
    spellcheck="false"
    placeholder={placeholderText}
    aria-label={placeholderText}
    on:input={schedulePublish}
    on:change={schedulePublish}
    on:keydown={handleKeydown}
  />
  {#if hasText}
    <button type="button" tabindex="-1" class={searchClear} aria-label={clearLabelText} on:click={clearText}>
      <X size={12} />
    </button>
  {/if}
</label>
