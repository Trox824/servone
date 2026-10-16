<script lang="ts">
  import { findPreset, type ProviderId } from '@servone/mail'
  import { Mail } from '@lucide/svelte'
  import { text } from '../plugin'
  import { Badge } from '../../lib/components/ui/badge'

  export let provider: ProviderId
  export let isSelected: boolean
  export let isDisabled: boolean = false
  export let onSelect: () => void

  $: label = provider === 'other' ? text('Other') : (findPreset(provider)?.label ?? provider)
</script>

<button
  type="button"
  class="provider-tile"
  class:provider-tile--selected={isSelected}
  disabled={isDisabled}
  aria-pressed={isSelected}
  onclick={onSelect}
>
  <span class="provider-tile__icon">
    {#if provider === 'gmail'}
      <!-- Same mark as plugins/gmail-resources GmailColor.svelte; servone-ui does not depend on that package. -->
      <svg viewBox="3 3 30 30" width="20" height="20" aria-hidden="true">
        <path fill="#EA4335" d="M25.8,8.4l-7.7,6l-7.9-6v0l0,0v8.4l7.8,6.1l7.8-5.9V8.4z" />
        <path fill="#FBBC05" d="M27.8,6.9l-2,1.5V17l6.4-4.9V9.2C32.1,9.2,31.4,5,27.8,6.9z" />
        <path fill="#34A853" d="M25.8,17v11.2h4.9c0,0,1.4-0.1,1.5-1.7V12.2L25.8,17z" />
        <path fill="#C5221F" d="M10.2,28.3V16.8l0,0L10.2,28.3z" />
        <path fill="#C5221F" d="M10.2,8.4l-2-1.5C4.6,5,3.9,9.2,3.9,9.2v2.9l6.4,4.6V8.4z" />
        <path fill="#C5221F" d="M10.2,8.4v8.4l0,0L10.2,8.4L10.2,8.4z" />
        <path fill="#4285F4" d="M3.9,12.2v14.4c0.1,1.6,1.5,1.7,1.5,1.7h4.9l0-11.5L3.9,12.2z" />
      </svg>
    {:else}
      <Mail size={20} strokeWidth={1.5} />
    {/if}
  </span>
  <span class="provider-tile__label">{label}</span>
  {#if isDisabled}
    <Badge variant="secondary" class="provider-tile__badge">{text('ComingSoon')}</Badge>
  {/if}
</button>

<style>
  .provider-tile {
    position: relative;
    display: flex;
    height: 96px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--theme-divider-color);
    border-radius: 8px;
    background: var(--theme-bg-color);
    color: var(--theme-content-color);
    font-size: 14px;
    font-weight: 400;
  }
  .provider-tile:not(:disabled):hover {
    background: var(--theme-button-hovered);
  }
  /* The reconnect popup renders outside .mail-app, and the global button reset removes the outline. */
  .provider-tile:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .provider-tile:disabled {
    color: var(--theme-halfcontent-color);
    cursor: not-allowed;
  }
  .provider-tile--selected {
    border-color: var(--primary);
    background: var(--theme-bg-accent-color);
  }
  .provider-tile__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--theme-bg-accent-color);
    color: var(--theme-halfcontent-color);
  }
  .provider-tile--selected .provider-tile__icon {
    color: var(--primary);
  }
  .provider-tile__badge {
    position: absolute;
    top: 6px;
    right: 6px;
  }
</style>
