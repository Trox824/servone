<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { Search, X } from '@lucide/svelte'
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import uiPlugin from '@hcengineering/ui/src/plugin'
  import { propSyncValue } from '@hcengineering/ui/src/components/SearchInputAdvanced.sync'
  import { encodeSearch, type SearchScope } from '../original'
  import { cn } from '../lib/utils'
  import { searchClear, searchInput, searchShell } from '../lib/search-classes'

  export let value: string | undefined = undefined
  export let placeholder: IntlString = uiPlugin.string.Search
  export let placeholderParam: any | undefined = undefined
  export let collapsed: boolean = false
  export let autoFocus: boolean = false
  export let width: string | undefined = undefined
  export let delay: number = 500
  export let scope: SearchScope = 'all'

  const dispatch = createEventDispatcher<{ change: { raw: string, encoded: string } }>()
  const clearLabelId = 'ui:string:ServoneClearSearch' as IntlString

  let inputElement: HTMLInputElement | undefined
  let localText: string = value ?? ''
  let pendingTimer: ReturnType<typeof setTimeout> | undefined
  let placeholderText = ''
  let clearLabelText = ''
  let lastSeenProp: string | undefined = value
  let lastSeenScope: SearchScope = scope
  let isMounted = false

  $: syncFromProp(value)
  $: hasText = localText !== ''
  $: translateCB(placeholder, placeholderParam ?? {}, $themeStore.language, (text: string) => {
    placeholderText = text
  })
  $: translateCB(clearLabelId, {}, $themeStore.language, (text: string) => {
    clearLabelText = text
  })
  $: if (scope !== lastSeenScope) {
    lastSeenScope = scope
    if (isMounted && localText.trim() !== '') {
      cancelPending()
      publish()
    }
  }

  function syncFromProp (nextProp: string | undefined): void {
    if (nextProp === lastSeenProp) return
    const replacement = propSyncValue(nextProp, lastSeenProp)
    if (replacement !== undefined) localText = replacement
    lastSeenProp = nextProp
  }

  function cancelPending (): void {
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer)
      pendingTimer = undefined
    }
  }

  function publish (): void {
    const raw = localText.trim()
    dispatch('change', { raw, encoded: encodeSearch(raw, scope) })
  }

  function publishNow (): void {
    cancelPending()
    publish()
  }

  function schedulePublish (): void {
    cancelPending()
    pendingTimer = setTimeout(publishNow, delay)
  }

  function clearText (): void {
    localText = ''
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
    isMounted = true
    if (autoFocus) inputElement?.focus()
  })

  onDestroy(cancelPending)
</script>

<label class={cn(searchShell)} style:width>
  <Search size={13} class="shrink-0 text-muted-foreground" />
  <input
    bind:this={inputElement}
    bind:value={localText}
    type="text"
    class={searchInput}
    autocomplete="off"
    spellcheck="false"
    placeholder={placeholderText}
    aria-label={placeholderText}
    on:input={schedulePublish}
    on:keydown={handleKeydown}
  />
  {#if hasText}
    <button type="button" tabindex="-1" class={searchClear} aria-label={clearLabelText} on:click={clearText}>
      <X size={12} />
    </button>
  {/if}
</label>
