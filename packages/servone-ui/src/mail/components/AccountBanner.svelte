<script lang="ts">
  import { deviceOptionsStore as deviceInfo } from '@hcengineering/ui'
  import { X } from '@lucide/svelte'
  import type { MailAccountCard } from '@servone/mail'
  import { accountBanner } from '../lib/banner'
  import { text } from '../plugin'
  import { Button } from '../../lib/components/ui/button'

  export let account: MailAccountCard
  export let onReconnect: (() => void) | undefined = undefined

  let hasBackfilled = false
  let isDismissed = false

  $: banner = accountBanner(account)
  $: if (banner.kind !== 'authError') isDismissed = false
  $: if (banner.kind === 'backfill') hasBackfilled = true
  $: syncStatus = banner.kind === 'backfill' ? text('StatusBackfilling') : hasBackfilled && banner.kind === 'none' ? text('StatusReady') : ''
</script>

<span class="sr-only" role="status">{syncStatus}</span>
{#if banner.kind === 'backfill'}
  <div class="account-banner account-banner--backfill">
    <div
      class="account-banner__progress"
      role="progressbar"
      aria-label={text('StatusBackfilling')}
      aria-valuemin={0}
      aria-valuemax={banner.total}
      aria-valuenow={banner.total > 0 ? banner.done : undefined}
    >
      <div class="account-banner__progress-bar" style="width: {banner.total > 0 ? (banner.done / banner.total) * 100 : 0}%" />
    </div>
    <span class="account-banner__text">{text('Backfilling', { done: banner.done, total: banner.total })}</span>
  </div>
{:else if banner.kind === 'authError' && !(isDismissed && $deviceInfo.isMobile)}
  <div class="account-banner account-banner--warning" class:account-banner--strip={$deviceInfo.isMobile} role="status">
    <span class="account-banner__text">{$deviceInfo.isMobile ? text('StatusAuthError') : text('AuthError', { email: banner.email })}</span>
    {#if onReconnect !== undefined}
      <Button size="sm" onclick={onReconnect}>{text('Reconnect')}</Button>
    {/if}
    {#if $deviceInfo.isMobile}
      <button type="button" class="account-banner__dismiss" aria-label={text('DismissBanner')} onclick={() => { isDismissed = true }}>
        <X size={16} />
      </button>
    {/if}
  </div>
{:else if banner.kind === 'offline'}
  <div class="account-banner account-banner--neutral" role="status">
    <span class="account-banner__text">{text('Offline', { host: banner.host })}</span>
  </div>
{/if}

<style>
  .account-banner {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .account-banner__text {
    color: var(--theme-halfcontent-color);
    font-size: 13px;
    font-weight: 400;
  }
  .account-banner--backfill {
    padding-top: 10px;
  }
  .account-banner__progress {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 2px;
    background: var(--theme-divider-color);
  }
  .account-banner__progress-bar {
    height: 100%;
    background: var(--primary);
  }
  .account-banner--warning {
    background: var(--theme-state-negative-background-color);
  }
  .account-banner--warning .account-banner__text {
    color: var(--theme-content-color);
  }
  .account-banner--strip {
    flex-wrap: nowrap;
    height: 36px;
    padding: 0 4px 0 12px;
  }
  .account-banner--strip .account-banner__text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .account-banner__dismiss {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    color: var(--theme-halfcontent-color);
  }
  .account-banner--neutral {
    background: var(--theme-bg-accent-color);
  }
</style>
