<script lang="ts">
  import type { PersonId } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { EmojiPresenter } from '@hcengineering/emoji-resources'
  import { Icon, tooltip, type IconComponent, type IconSize } from '@hcengineering/ui'
  import ReactionsTooltip from './ReactionsTooltip.svelte'

  export let icon: IconComponent | undefined = undefined
  export let iconSize: IconSize | undefined = undefined
  export let emoji: string = ''
  export let count: number | undefined = undefined
  export let selected: boolean = false
  export let active: boolean = false
  export let socialIds: PersonId[] = []

  const addReactionLabel = 'activity:string:AddReaction' as IntlString

  $: hasCount = count !== undefined && count > 0
  $: hint = hasCount
    ? { component: ReactionsTooltip, props: { socialIds, emoji } }
    : icon !== undefined
      ? { label: addReactionLabel }
      : undefined
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="chip" class:selected class:active on:click use:tooltip={hint}>
  <div class="face">
    {#if icon !== undefined}
      <Icon {icon} size={iconSize ?? 'small'} />
    {:else}
      <EmojiPresenter {emoji} />
    {/if}
  </div>
  {#if hasCount}
    <span class="tally">{count}</span>
  {/if}
</div>

<style>
  .chip {
    display: flex;
    align-items: center;
    height: 28px;
    padding: 6px;
    gap: 4px;
    border-radius: 8px;
    cursor: pointer;
    background: var(--selector-BackgroundColor);
  }
  .chip:hover,
  .chip.active {
    background: var(--global-ui-hover-BackgroundColor);
  }
  .chip.selected,
  .chip.selected:hover {
    background: var(--global-accent-SkyText);
  }
  .face {
    color: var(--global-primary-TextColor);
    font-size: 16px;
    font-weight: 400;
    line-height: 16px;
  }
  .tally {
    color: var(--global-primary-TextColor);
    font-size: 12px;
    font-weight: 500;
  }
</style>
