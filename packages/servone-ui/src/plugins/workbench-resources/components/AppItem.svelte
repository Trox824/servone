<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import type { AnySvelteComponent } from '@hcengineering/ui'
  import { Icon, Loading, tooltip } from '@hcengineering/ui'
  import { themeStore } from '@hcengineering/theme'
  import { createQuery } from '@hcengineering/presentation'
  import { getCurrentAccount } from '@hcengineering/core'
  import { MAIL_FOLDER_CLASS } from '@servone/mail'
  import { LayoutGrid } from '@lucide/svelte'
  import { badgeText, inboxUnreadQuery } from '../../../mail/sidebar'
  import { str as mailStr } from '../../../mail/plugin'

  export let label: IntlString
  export let icon: Asset | AnySvelteComponent
  export let iconFill = 'currentColor'
  export let selected = false
  export let size: 'small' | 'medium' | 'large' = 'large'
  export let kind: 'default' | 'positive' | 'negative' | 'warning' | 'accented' = 'default'
  export let loading = false
  export let notify = false
  export let navigator = false
  export let dataId: string | undefined = undefined
  export let keys: string[] | undefined = undefined

  const unreadQuery = createQuery()
  let captionText = ''
  let unreadCount = 0
  let unreadText = ''

  $: translateCB(label, {}, $themeStore.language, (text) => {
    captionText = text
  })

  $: isMailButton = dataId === 'app-sidebar-mail'
  $: if (isMailButton) {
    unreadQuery.query(
      MAIL_FOLDER_CLASS,
      inboxUnreadQuery(getCurrentAccount().uuid),
      (folders) => {
        unreadCount = folders[0]?.mailUnread ?? 0
      },
      { limit: 1 }
    )
  } else {
    unreadQuery.unsubscribe()
    unreadCount = 0
  }

  $: if (unreadCount > 0) {
    translateCB(mailStr.UnreadCount, { count: unreadCount }, $themeStore.language, (text) => {
      unreadText = text
    })
  } else {
    unreadText = ''
  }

  $: accessibleName = unreadCount > 0 && unreadText !== '' ? `${captionText}, ${unreadText}` : captionText
  $: badgeLabel = isMailButton ? badgeText(unreadCount) : ''
  $: isCustomizeButton = dataId === 'workbench-app-customize'
</script>

<button
  id={`app-${label}`}
  data-id={dataId}
  class="app {size} {kind}"
  class:selected
  class:loading
  class:navigator
  type="button"
  disabled={loading}
  aria-label={accessibleName}
  aria-current={selected ? 'page' : undefined}
  use:tooltip={{ label, keys }}
  on:click
>
  {#if loading}
    <Loading />
  {:else}
    <div class="icon-container" class:noty={notify}>
      {#if isCustomizeButton}
        <LayoutGrid size={size === 'small' ? 14 : 16} />
      {:else}
        <Icon {icon} size={size === 'small' ? 'small' : 'medium'} fill={iconFill} />
      {/if}
    </div>
    <span class="caption">{captionText}</span>
    {#if notify}
      <span class="notify-dot"></span>
    {/if}
    {#if badgeLabel !== ''}
      <span class="unread-pill" aria-hidden="true">{badgeLabel}</span>
    {/if}
  {/if}
</button>

<style>
  .app {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    outline: none;
  }
  .large {
    width: 36px;
    height: 36px;
  }
  .medium {
    width: 32px;
    height: 32px;
  }
  .small {
    width: calc(var(--status-bar-normal-height) - 8px);
    height: calc(var(--status-bar-normal-height) - 8px);
    border-radius: 4px;
  }
  .icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--theme-navpanel-icons-color);
  }
  .small .icon-container {
    width: calc(var(--status-bar-normal-height) - 8px);
    height: calc(var(--status-bar-normal-height) - 8px);
  }
  .caption {
    display: none;
  }
  .app:hover .icon-container {
    color: var(--theme-caption-color);
  }
  .app:focus-visible {
    box-shadow: 0 0 0 2px var(--primary-button-outline);
  }
  .app:focus-visible .icon-container {
    color: var(--theme-caption-color);
  }
  .selected {
    background-color: var(--theme-button-pressed);
  }
  .selected .icon-container {
    color: var(--theme-caption-color);
  }
  .navigator {
    border-color: var(--theme-button-border);
  }
  .loading {
    pointer-events: none;
  }
  .positive,
  .positive.selected {
    background-color: var(--global-online-color);
  }
  .negative,
  .negative.selected {
    background-color: var(--button-negative-BackgroundColor);
  }
  .warning,
  .warning.selected {
    background-color: var(--theme-warning-color);
  }
  .accented,
  .accented.selected {
    background-color: var(--button-secondary-active-BackgroundColor);
  }
  .positive .icon-container,
  .negative .icon-container,
  .warning .icon-container,
  .accented .icon-container {
    color: var(--primary-button-color);
  }
  .notify-dot {
    position: absolute;
    top: 1.1rem;
    right: 0.375rem;
    width: 0.425rem;
    height: 0.425rem;
    border-radius: 50%;
    background-color: var(--highlight-red);
  }
  .unread-pill {
    position: absolute;
    bottom: -0.25rem;
    right: -0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 16px;
    min-width: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background-color: var(--primary);
    color: white;
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
  }
</style>
