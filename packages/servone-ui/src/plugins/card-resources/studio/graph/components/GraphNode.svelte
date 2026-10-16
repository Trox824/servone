<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte'
  import { ExternalLink, Hourglass, LayoutGrid, Lock, Plus, User } from '@lucide/svelte'
  import { text } from '../../strings'
  import type { FlowData } from '../flow'
  import { isLeaf } from '../layout'

  export let data: FlowData
  export let selected = false

  $: node = data.node
  $: isAdd = node.kind === 'add' || node.kind === 'addType'
  $: isStep = node.kind === 'approval' || node.kind === 'step'
  $: isLeafNode = isLeaf(node.kind)
</script>

<div
  class="graph-node"
  class:is-add={isAdd}
  class:is-huly={node.kind === 'hulyRule'}
  class:is-faded={node.kind === 'inherited'}
  class:is-branch={node.kind === 'branch'}
  class:is-form={node.kind === 'form'}
  class:is-selected={selected}
  class:is-match={data.isMatch}
  style:width={`${data.width}px`}
  title={node.label}
  data-id="graph-node"
  data-node-id={node.id}
>
  <Handle type="target" position={Position.Left} isConnectable={false} class="graph-handle" />
  {#if node.isPending}
    <span class="graph-badge is-wait" data-id="graph-node-pending"><Hourglass size={12} />{text('GraphPending')}</span>
  {:else if data.isNew}
    <span class="graph-badge is-new" data-id="graph-node-new">{text('GraphNew')}</span>
  {/if}
  {#if isAdd}
    <div class="graph-title graph-row"><Plus size={14} />{node.label}</div>
    {#if node.detail !== ''}<div class="graph-sub">{node.detail}</div>{/if}
  {:else if isLeafNode}
    <div class="graph-row graph-leaf">
      <span class="graph-leaf-name">{node.label}</span>
      {#if node.detail !== ''}<span class="graph-sub">{node.detail}</span>{/if}
    </div>
  {:else if isStep}
    <div class="graph-kicker">{node.label}</div>
    {#if node.detail !== ''}<div class="graph-title">{node.detail}</div>{/if}
    {#each node.lines as line, index (index)}
      <div class="graph-line">{line}</div>
    {/each}
  {:else}
    <div class="graph-title graph-row">
      {#if node.kind === 'hulyRule'}<Lock size={14} />{/if}{node.label}
    </div>
    {#if node.detail !== ''}<div class="graph-sub">{node.detail}</div>{/if}
    {#if node.kind === 'hulyRule'}
      <span class="graph-open">{text('GraphOpenInHuly')}<ExternalLink size={12} /></span>
    {/if}
  {/if}
  {#if node.state !== undefined}
    <span class="graph-state" data-id="graph-node-state">{node.state}</span>
  {/if}
  {#if node.chips.length > 0}
    <div class="graph-chips">
      {#each node.chips as chip, index (index)}
        <span class="graph-chip">
          {#if chip.kind === 'person'}<User size={12} />{:else}<LayoutGrid size={12} />{/if}{chip.label}
        </span>
      {/each}
    </div>
  {/if}
  <!-- Every edge starts at a source handle, so it renders even where the "+" is hidden. -->
  <Handle type="source" position={Position.Right} isConnectable={data.canAdd} class={data.canAdd ? 'graph-plus' : 'graph-handle'}>
    {#if data.canAdd}<span class="graph-plus-dot"><Plus size={14} /></span>{/if}
  </Handle>
</div>

<style>
  .graph-node {
    position: relative;
    display: grid;
    gap: 4px;
    box-sizing: border-box;
    min-height: 40px;
    padding: 10px 12px;
    border: 1px solid var(--theme-button-border);
    border-radius: 10px;
    background: var(--theme-popup-color);
    color: var(--theme-caption-color);
    box-shadow: var(--theme-popup-shadow);
    font-size: 13px;
    line-height: 18px;
    text-align: left;
    cursor: pointer;
  }
  .is-selected,
  .is-match {
    border-color: var(--primary-button-default);
    box-shadow: 0 0 0 3px var(--primary-button-transparent);
  }
  /* Mockup screen 2: the opened form is the one filled box, so the tree's root reads first. */
  .is-form {
    border-color: var(--primary-button-default);
    background: var(--primary-button-default);
    color: var(--primary-button-color);
  }
  .is-form .graph-sub {
    color: var(--primary-button-color);
    opacity: 0.8;
  }
  .is-form .graph-chip {
    background: rgba(255, 255, 255, 0.18);
    color: var(--primary-button-color);
  }
  .is-add {
    border-style: dashed;
    background: transparent;
    box-shadow: none;
    color: var(--primary-button-default);
  }
  .is-huly {
    border-style: dashed;
    background: var(--theme-button-default);
    box-shadow: none;
  }
  .is-faded {
    color: var(--theme-halfcontent-color);
  }
  .graph-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .graph-leaf {
    justify-content: space-between;
  }
  .graph-leaf-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .graph-title {
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .graph-sub {
    flex-shrink: 0;
    color: var(--theme-dark-color);
    font-size: 12px;
  }
  .graph-kicker {
    color: var(--theme-halfcontent-color);
    font-size: 12px;
    font-weight: 500;
  }
  .graph-line {
    color: var(--theme-content-color);
    overflow-wrap: anywhere;
  }
  .graph-state,
  .graph-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    justify-self: start;
    height: 20px;
    padding: 0 8px;
    border-radius: 10px;
    background: var(--theme-bg-accent-color);
    color: var(--theme-dark-color);
    font-size: 11px;
  }
  .graph-chip {
    padding: 0 7px;
    border-radius: 5px;
    font-size: 11.5px;
    white-space: nowrap;
  }
  .graph-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .graph-badge {
    position: absolute;
    top: -10px;
    right: 10px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
  }
  .is-wait {
    border: 1px solid var(--theme-button-warning-border);
    background: var(--theme-button-warning-bg);
    color: var(--theme-button-warning-color);
  }
  .is-new {
    background: var(--primary-button-default);
    color: var(--primary-button-color);
  }
  .graph-open {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--theme-link-color);
    font-size: 12px;
  }
  .graph-node :global(.graph-handle) {
    opacity: 0;
    pointer-events: none;
  }
  /* A 32px hit area around the mockup's 22px circle (tap targets >= 32px). */
  .graph-node :global(.svelte-flow__handle.graph-plus) {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    right: -16px;
    border: 0;
    border-radius: 16px;
    background: transparent;
  }
  .graph-node:not(:hover):not(.is-selected) :global(.graph-plus) {
    opacity: 0;
  }
  .graph-plus-dot {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 11px;
    background: var(--primary-button-default);
    color: var(--primary-button-color);
    pointer-events: none;
  }
</style>
