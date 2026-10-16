<script lang="ts">
  import { type IntlString, getMetadata } from '@hcengineering/platform'
  import { getContext } from 'svelte'
  import { type Readable } from 'svelte/store'
  import FontSize from '@hcengineering/ui/src/components/internal/icons/FontSize.svelte'
  import EmojiStyle from '@hcengineering/ui/src/components/internal/icons/EmojiStyle.svelte'
  import Language from '@hcengineering/ui/src/components/internal/icons/Language.svelte'
  import ThemeButton from '@hcengineering/ui/src/components/internal/ThemeButton.svelte'
  import ui, { Html, Icon, Label, ModernPopup, showPopup, deviceOptionsStore, modalStore, eventToHTMLElement } from '../../original'
  import { configuredLanguages } from '../../lib/ui-languages'

  const { currentFontSize, setFontSize } = getContext<{
    currentFontSize: Readable<string>
    setFontSize: (fontSizeId: string) => void
  }>('fontsize')
  const { currentTheme, setTheme } = getContext<{
    currentTheme: Readable<string>
    setTheme: (themeId: string) => void
  }>('theme')
  const { currentLanguage, setLanguage } = getContext<{
    currentLanguage: Readable<string>
    setLanguage: (languageId: string) => void
  }>('lang')
  const { currentEmoji, setEmoji } = getContext<{
    currentEmoji: Readable<string>
    setEmoji: (emojiId: string) => void
  }>('emoji')

  const themeChoices = [
    { id: 'theme-light', label: ui.string.ThemeLight },
    { id: 'theme-dark', label: ui.string.ThemeDark },
    { id: 'theme-system', label: ui.string.ThemeSystem }
  ]
  const fontSizeChoices = [
    { id: 'normal-font', label: ui.string.Spacious, size: 16 },
    { id: 'small-font', label: ui.string.Compact, size: 14 }
  ]
  const emojiChoices = [
    { id: 'emoji-system', label: ui.string.EmojiSystem },
    { id: 'emoji-noto', label: ui.string.EmojiNoto }
  ]
  const languageChoices = configuredLanguages()

  const rowClass =
    'relative flex min-h-8 w-full cursor-pointer items-center justify-between rounded px-2 text-left text-[13px] text-foreground'

  if (languageChoices.length > 0) {
    if (!languageChoices.some((choice) => choice.id === $currentLanguage)) {
      setLanguage(languageChoices[0].id)
    }
  } else {
    const configured = (getMetadata(ui.metadata.Languages) ?? []).join(', ')
    console.error(
      `The configured UI languages [${configured}] contain none that the app supports. Check the configuration.`
    )
  }

  $: deviceOptionsStore.update((options) => ({ ...options, theme: $currentTheme }))

  $: activeTheme = themeChoices.find((choice) => choice.id === $currentTheme) ?? themeChoices[0]
  $: activeFontSize = fontSizeChoices.find((choice) => choice.id === $currentFontSize) ?? fontSizeChoices[0]
  $: activeEmoji = emojiChoices.find((choice) => choice.id === $currentEmoji) ?? emojiChoices[0]
  $: activeLanguage = languageChoices.find((choice) => choice.id === $currentLanguage) ?? languageChoices[0]

  function chooseTheme (themeId: string): void {
    if (themeId !== activeTheme.id) setTheme(themeId)
  }

  function openFontSizePicker (event: MouseEvent): void {
    const pickerItems = fontSizeChoices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      size: choice.size,
      icon: FontSize,
      iconProps: { size: choice.size }
    }))
    showPopup(ModernPopup, { items: pickerItems, selected: activeFontSize.id }, eventToHTMLElement(event), (pickedId?: string) => {
      if (pickedId === undefined || pickedId === activeFontSize.id) return
      setFontSize(pickedId)
      modalStore.update((stack) => stack)
    })
  }

  function openEmojiPicker (event: MouseEvent): void {
    const pickerItems = emojiChoices.map((choice) => ({ id: choice.id, label: choice.label }))
    showPopup(ModernPopup, { items: pickerItems, selected: activeEmoji.id }, eventToHTMLElement(event), (pickedId?: string) => {
      if (pickedId === undefined || pickedId === activeEmoji.id) return
      setEmoji(pickedId)
    })
  }

  function openLanguagePicker (event: MouseEvent): void {
    const pickerItems = languageChoices.map((choice) => ({
      id: choice.id,
      label: choice.label as IntlString,
      logo: choice.logo,
      icon: Html,
      iconProps: { value: choice.logo }
    }))
    showPopup(ModernPopup, { items: pickerItems, selected: activeLanguage.id }, eventToHTMLElement(event), (pickedId?: string) => {
      if (pickedId === undefined || pickedId === activeLanguage.id) return
      setLanguage(pickedId)
    })
  }
</script>

<div class="antiPopup thinStyle overflow-y-auto py-1">
  <div class="m-4 flex gap-3">
    {#each themeChoices as themeChoice (themeChoice.id)}
      {@const isCurrentTheme = themeChoice.id === activeTheme.id}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="group flex flex-col items-center {isCurrentTheme ? 'cursor-default' : 'cursor-pointer'}"
        on:click={() => chooseTheme(themeChoice.id)}
      >
        <ThemeButton theme={themeChoice.id} focused={activeTheme.id} />
        <span
          class="mt-2 text-xs {isCurrentTheme
            ? 'font-semibold text-foreground'
            : 'font-medium text-muted-foreground group-hover:text-foreground'}"
        >
          <Label label={themeChoice.label} />
        </span>
      </div>
    {/each}
  </div>

  <div class="my-1 h-px w-full bg-border"></div>
  <button type="button" class={rowClass} on:click={openFontSizePicker}>
    <span class="flex items-center gap-2 font-medium">
      <span class="text-muted-foreground"><FontSize size="16px" /></span>
      <Label label={ui.string.FontSize} />
    </span>
    <span class="pr-4"><Label label={activeFontSize.label} /></span>
    <svg class="absolute right-2 top-1/2 h-2.5 w-1.5 -translate-y-1/2 text-muted-foreground" viewBox="0 0 6 10" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M1 1l4 4-4 4" />
    </svg>
  </button>

  <div class="my-1 h-px w-full bg-border"></div>
  <button type="button" class={rowClass} on:click={openEmojiPicker}>
    <span class="flex items-center gap-2 font-medium">
      <span class="text-muted-foreground"><EmojiStyle size="16px" /></span>
      <Label label={ui.string.EmojiStyle} />
    </span>
    <span class="pr-4"><Label label={activeEmoji.label} /></span>
    <svg class="absolute right-2 top-1/2 h-2.5 w-1.5 -translate-y-1/2 text-muted-foreground" viewBox="0 0 6 10" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M1 1l4 4-4 4" />
    </svg>
  </button>

  <div class="my-1 h-px w-full bg-border"></div>
  <button type="button" class={rowClass} on:click={openLanguagePicker}>
    <span class="flex items-center gap-2 font-medium">
      <span class="text-muted-foreground"><Icon icon={Language} size={'small'} /></span>
      <Label label={ui.string.Language} />
    </span>
    <span class="pr-4 text-lg"><Html value={activeLanguage.logo} /></span>
    <svg class="absolute right-2 top-1/2 h-2.5 w-1.5 -translate-y-1/2 text-muted-foreground" viewBox="0 0 6 10" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M1 1l4 4-4 4" />
    </svg>
  </button>
</div>
