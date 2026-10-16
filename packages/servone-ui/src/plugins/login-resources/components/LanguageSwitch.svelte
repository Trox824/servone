<script lang="ts">
  import { getContext } from 'svelte'
  import type { Readable } from 'svelte/store'
  import { cn } from '../../../lib/utils'
  import { markLanguageChosen } from './accountLocale'

  const LANGUAGES = [
    { id: 'en', label: 'EN' },
    { id: 'vi', label: 'VI' }
  ]

  const { currentLanguage, setLanguage } = getContext<{
    currentLanguage: Readable<string>
    setLanguage: (language: string) => void
  }>('lang')

  function pick (language: string): void {
    markLanguageChosen()
    setLanguage(language)
  }
</script>

<div class="flex items-center gap-1 text-xs font-medium" role="group">
  {#each LANGUAGES as language, index (language.id)}
    {#if index > 0}<span class="text-muted-foreground" aria-hidden="true">|</span>{/if}
    <button
      type="button"
      class={cn(
        'rounded px-1.5 py-1 hover:text-foreground',
        $currentLanguage === language.id ? 'text-foreground' : 'text-muted-foreground'
      )}
      aria-pressed={$currentLanguage === language.id}
      on:click={() => {
        pick(language.id)
      }}>{language.label}</button
    >
  {/each}
</div>
