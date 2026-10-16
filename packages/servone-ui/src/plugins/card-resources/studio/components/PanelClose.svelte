<script lang="ts">
  import { X } from '@lucide/svelte'
  import { text } from '../strings'

  export let onClose: () => void
</script>

<button type="button" class="panel-close" aria-label={text('GraphClose')} data-id="graph-panel-close" onclick={onClose}>
  <X size={16} />
</button>

<style>
  .panel-close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 6px;
    color: var(--theme-dark-color);
  }
  .panel-close:hover {
    background: var(--theme-button-default);
  }
</style>
