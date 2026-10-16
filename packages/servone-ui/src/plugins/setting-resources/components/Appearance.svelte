<!-- Settings > Appearance: the theme, font size, emoji and language choices from the account menu popup, as a page. -->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { translate } from '@hcengineering/platform'
  import { Breadcrumb, Header, Label, Scroller, deviceOptionsStore as deviceInfo, themeStore } from '@hcengineering/ui'
  import ThemeIcon from '@hcengineering/ui/src/components/internal/icons/Theme.svelte'
  import ui from '../../../original'
  import { getContext } from 'svelte'
  import type { Readable } from 'svelte/store'
  import * as Select from '../../../lib/components/ui/select'
  import { configuredLanguages } from '../../../lib/ui-languages'

  const APPEARANCE = 'setting:string:ServoneAppearance' as IntlString
  const THEME = 'setting:string:ServoneTheme' as IntlString

  const { currentTheme, setTheme } = getContext<{ currentTheme: Readable<string>, setTheme: (theme: string) => void }>(
    'theme'
  )
  const { currentFontSize, setFontSize } = getContext<{
    currentFontSize: Readable<string>
    setFontSize: (size: string) => void
  }>('fontsize')
  const { currentEmoji, setEmoji } = getContext<{ currentEmoji: Readable<string>, setEmoji: (emoji: string) => void }>(
    'emoji'
  )
  const { currentLanguage, setLanguage } = getContext<{
    currentLanguage: Readable<string>
    setLanguage: (language: string) => void
  }>('lang')

  const themes = [
    { id: 'theme-light', label: ui.string.ThemeLight },
    { id: 'theme-dark', label: ui.string.ThemeDark },
    { id: 'theme-system', label: ui.string.ThemeSystem }
  ]
  const fontSizes = [
    { id: 'normal-font', label: ui.string.Spacious },
    { id: 'small-font', label: ui.string.Compact }
  ]
  const emojis = [
    { id: 'emoji-system', label: ui.string.EmojiSystem },
    { id: 'emoji-noto', label: ui.string.EmojiNoto }
  ]
  const languages = configuredLanguages().map(({ id, label }) => ({ id, label }))

  const selects = [
    { title: ui.string.FontSize, options: fontSizes, pick: setFontSize },
    { title: ui.string.EmojiStyle, options: emojis, pick: setEmoji },
    { title: ui.string.Language, options: languages, pick: setLanguage }
  ]

  $: selectedIds = [$currentFontSize, $currentEmoji, $currentLanguage]
  let translated = new Map<string, string>()
  $: void Promise.all(
    [...themes, ...fontSizes, ...emojis, ...languages].map(async ({ id, label }): Promise<[string, string]> => [
      id,
      await translate(label, {}, $themeStore.language)
    ])
  ).then((entries) => {
    translated = new Map(entries)
  })

  $: $deviceInfo.theme = $currentTheme
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={ThemeIcon} label={APPEARANCE} size={'large'} isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-2xl flex-col px-6 py-6">
      <section class="flex flex-col gap-3">
        <div class="text-sm font-medium text-foreground"><Label label={THEME} /></div>
        <div class="flex gap-4">
          {#each themes as theme (theme.id)}
            <button
              type="button"
              class="flex flex-col items-center gap-2 text-sm"
              class:text-foreground={$currentTheme === theme.id}
              class:text-muted-foreground={$currentTheme !== theme.id}
              aria-pressed={$currentTheme === theme.id}
              on:click={() => {
                if ($currentTheme !== theme.id) setTheme(theme.id)
              }}
            >
              <span
                class="relative flex h-14 w-20 overflow-hidden rounded-md border"
                class:border-primary={$currentTheme === theme.id}
                class:border-border={$currentTheme !== theme.id}
              >
                {#if theme.id !== 'theme-dark'}
                  <span class="flex-1 bg-neutral-100"></span>
                {/if}
                {#if theme.id !== 'theme-light'}
                  <span class="flex-1 bg-neutral-700"></span>
                {/if}
              </span>
              <Label label={theme.label} />
            </button>
          {/each}
        </div>
      </section>

      <section class="mt-6 flex flex-col gap-4 border-t border-border pt-6">
        {#each selects as { title, options, pick }, index (title)}
          <div class="flex items-center justify-between gap-4">
            <span class="text-sm text-foreground"><Label label={title} /></span>
            <Select.Root
              type="single"
              value={selectedIds[index]}
              onValueChange={(picked) => {
                if (picked !== selectedIds[index]) pick(picked)
              }}
            >
              <Select.Trigger class="w-44">{translated.get(selectedIds[index]) ?? ''}</Select.Trigger>
              <Select.Content>
                {#each options as option (option.id)}
                  <Select.Item value={option.id} label={translated.get(option.id) ?? option.id} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        {/each}
      </section>
    </div>
  </Scroller>
</div>
