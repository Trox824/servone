<script lang="ts">
  import type { ComponentType } from 'svelte'

  export let icon: ComponentType
  export let title: string
  export let lines: string[] = []
</script>

<div class="empty-pane" role="status">
  <svelte:component this={icon} size={32} strokeWidth={1.5} class="empty-pane__icon" />
  <p class="empty-pane__title">{title}</p>
  {#each lines as line}
    <p class="empty-pane__line">{line}</p>
  {/each}
</div>

<style>
  .empty-pane {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    text-align: center;
  }
  .empty-pane__icon {
    color: var(--theme-halfcontent-color);
  }
  .empty-pane__title {
    margin: 0;
    color: var(--theme-caption-color);
    font-size: 16px;
    font-weight: 600;
    line-height: 24px;
  }
  .empty-pane__line {
    margin: 0;
    color: var(--theme-halfcontent-color);
    font-size: 13px;
    font-weight: 400;
    line-height: 18px;
  }
</style>
