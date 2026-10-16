<!-- The calendar widget's switcher (Widget.switcherComponent, swapped in by Sidebar.svelte) with the SRV-149 "Needs you" count. -->
<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import type { AnySvelteComponent } from '@hcengineering/ui'
  import { badgeText } from '../../../../mail/sidebar'
  import { needsStore } from '../../../calendar-resources/lich/needs'
  import { textOf } from '../../../calendar-resources/lich/strings'
  import AppItem from '../AppItem.svelte'

  export let label: IntlString
  export let icon: Asset | AnySvelteComponent
  export let selected = false
  export let size: 'small' | 'medium' | 'large' = 'small'

  $: t = textOf($languageStore === 'vi' ? 'vi' : 'en')
  $: count = $needsStore.needs.length
  $: badge = badgeText(count)
</script>

<span class="relative inline-flex">
  <AppItem {label} {icon} {selected} {size} on:click />
  {#if badge !== ''}
    <span class="needs-badge" aria-hidden="true">{badge}</span>
    <span class="sr-only">{t('NeedsYouCount', { count })}</span>
  {/if}
</span>

<style lang="scss">
  .needs-badge {
    position: absolute;
    top: -0.25rem;
    right: -0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 1rem;
    min-width: 1rem;
    padding: 0 0.25rem;
    border-radius: 0.5rem;
    background-color: var(--primary);
    color: #fff;
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1rem;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
</style>
