<!--
  Lazy-chunk placeholder: no content-shaped rows, only Loading's delayed spinner (chunks take 0-500ms, once).
  flex-1 (basis 0) keeps a flex-row parent's label at natural width; chrome.css sizes it per slot.
-->
<script lang="ts">
  import Loading from './Loading.svelte'

  export let shrink: boolean = false
</script>

{#if shrink}
  <span data-slot="pending-component" class="inline-block" aria-busy="true"></span>
{:else}
  <div data-slot="pending-component" class="flex h-full min-h-0 w-full min-w-0 flex-1" aria-busy="true">
    <Loading />
  </div>
{/if}
