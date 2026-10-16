<script lang="ts">
  import { Component, navFooterExtensions } from '@hcengineering/ui'
  import { getClient } from '@hcengineering/presentation'
  import { onMount } from 'svelte'
  import { ensureWorkflowApp } from '../../tracker-resources/workflows/sidebar'

  export let split = false

  onMount(() => {
    void ensureWorkflowApp(getClient())
  })

  $: orderedWidgets = [...$navFooterExtensions].sort((left, right) => left.order - right.order)
  $: hasFooterContent = $$slots.default === true || orderedWidgets.length > 0
</script>

{#if hasFooterContent}
  <div class="antiNav-footer-line"></div>
{/if}
<div class="antiNav-footer-grower"></div>
{#if hasFooterContent}
  <div class="antiNav-footer">
    <slot />
    {#each orderedWidgets as widget (widget.id)}
      <Component is={widget.component} props={widget.props ?? {}} />
    {/each}
    {#if split}
      <div class="antiNav-space"></div>
    {/if}
  </div>
{/if}
