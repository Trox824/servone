<script lang="ts">
  import type { ActivityMessage } from '@hcengineering/activity'
  import type { IntlString } from '@hcengineering/platform'
  import { Label } from '@hcengineering/ui'
  import { webhookName } from './api'

  export let message: ActivityMessage | undefined

  const APP = 'chunter:string:ServoneAppBadge' as IntlString

  $: name = message !== undefined ? webhookName(message) : undefined
</script>

{#if name !== undefined}
  <span class="webhook-badge flex-row-center gap-1">
    <span class="name">{name}</span>
    <span class="app"><Label label={APP} /></span>
  </span>
{/if}

<style lang="scss">
  .webhook-badge {
    display: inline-flex;
    min-width: 0;
    font-size: 0.75rem;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-dark-color);
  }
  .app {
    flex-shrink: 0;
    padding: 0 0.25rem;
    border-radius: 0.25rem;
    font-weight: 500;
    color: var(--theme-caption-color);
    background-color: var(--theme-button-default);
  }
</style>
