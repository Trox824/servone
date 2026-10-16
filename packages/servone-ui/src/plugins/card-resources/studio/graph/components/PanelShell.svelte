<script lang="ts">
  import PanelClose from '../../components/PanelClose.svelte'

  export let kicker: string
  export let title: string
  export let onClose: () => void
  export let isFooterShown = true
</script>

<aside class="graph-panel" data-id="graph-panel" aria-label={title}>
  <header class="graph-panel-head">
    <div class="grid min-w-0 gap-0.5">
      <span class="graph-panel-kicker">{kicker}</span>
      <h2 class="m-0 truncate text-base font-semibold">{title}</h2>
    </div>
    <PanelClose {onClose} />
  </header>
  <div class="graph-panel-body"><slot /></div>
  {#if $$slots.footer && isFooterShown}
    <footer class="graph-panel-foot"><slot name="footer" /></footer>
  {/if}
</aside>

<style>
  /* Mockup right panel: 380px, solid surface, no blur. */
  .graph-panel {
    display: flex;
    flex-direction: column;
    width: 380px;
    flex-shrink: 0;
    min-height: 0;
    border-left: 1px solid var(--theme-divider-color);
    background: var(--theme-popup-color);
    text-align: left;
  }
  .graph-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 16px 16px 12px;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .graph-panel-kicker {
    color: var(--theme-halfcontent-color);
    font-size: 12px;
  }
  .graph-panel-body {
    display: grid;
    align-content: start;
    gap: 16px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px;
  }
  .graph-panel-foot {
    display: grid;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--theme-divider-color);
  }
</style>
