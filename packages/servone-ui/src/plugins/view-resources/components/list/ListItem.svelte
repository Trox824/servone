<script lang="ts">
  import { getObjectValue, type Doc } from '@hcengineering/core'
  import notification from '@hcengineering/notification'
  import { translate } from '@hcengineering/platform'
  import { getClient, updateAttribute } from '@hcengineering/presentation'
  import { CheckBox, Component, IconCircles, IconCollapseArrow, themeStore, tooltip, deviceOptionsStore } from '@hcengineering/ui'
  import type { AttributeModel } from '@hcengineering/view'
  import { createEventDispatcher, onMount } from 'svelte'
  import { str as sprintStr } from '../../../tracker-resources/sprints/plugin'
  import view from '../../plugin'
  import GrowPresenter from './GrowPresenter.svelte'
  import ListPresenter from './ListPresenter.svelte'

  export let docObject: Doc
  export let model: AttributeModel[]
  export let groupByKey: string | undefined
  export let checked: boolean
  export let selected: boolean
  export let last: boolean = false
  export let lastCat: boolean = false
  export let props: Record<string, unknown> = {}
  export let compactMode: boolean = false
  export let readonly: boolean = false
  export let depth: number = 0
  export let tree: boolean = false
  export let expandable: boolean = false
  export let expanded: boolean = true

  const INDENT_STEP_REM = 1.75
  const BASE_PADDING_REM = 0.75

  const client = getClient()
  const dispatch = createEventDispatcher<{
    check: { docs: Doc[], value: boolean }
    'on-mount': undefined
    'tree-toggle': undefined
  }>()

  let rowElement: HTMLDivElement
  let toggleLabel: string | undefined

  onMount(() => {
    dispatch('on-mount')
  })

  export function scroll (): void {
    rowElement?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
  }

  export function getDoc (): Doc {
    return docObject
  }

  export function getElement (): HTMLDivElement {
    return rowElement
  }

  async function loadToggleLabel (isExpanded: boolean, language: string): Promise<void> {
    toggleLabel = await translate(isExpanded ? sprintStr.HideIssues : sprintStr.ShowIssues, {}, language)
  }

  function readCell (cell: AttributeModel): unknown {
    return getObjectValue(cell.key, docObject)
  }

  function makeEditor (cell: AttributeModel): ((newValue: unknown) => void) | undefined {
    const attribute = cell.attribute
    if (attribute === undefined || cell.collectionAttr || cell.isLookup || attribute.readonly === true) {
      return undefined
    }
    return (newValue) => {
      void updateAttribute(client, docObject, docObject._class, { key: cell.key, attr: attribute }, newValue)
    }
  }

  function isHiddenByGrouping (cell: AttributeModel, key: string | undefined): boolean {
    return key !== undefined && cell.displayProps?.excludeByKey === key
  }

  function isShownInPanel (cell: AttributeModel, key: string | undefined): boolean {
    return cell.displayProps?.excludeByKey !== key && readCell(cell) !== undefined
  }

  function blurTarget (event: MouseEvent): void {
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.blur()
  }

  function toggleChildren (event: MouseEvent): void {
    event.stopPropagation()
    dispatch('tree-toggle')
  }

  $: void loadToggleLabel(expanded, $themeStore.language)
  $: isMobile = $deviceOptionsStore.isMobile

  $: optionalCells = model.filter((cell) => cell.displayProps?.optional === true)
  $: compressionCells = model.filter((cell) => cell.displayProps?.compression === true)
  $: suffixCells = model.filter((cell) => cell.displayProps?.suffix === true)
  $: plainCells = model.filter(
    (cell) =>
      cell.displayProps?.optional !== true &&
      cell.displayProps?.compression !== true &&
      cell.displayProps?.suffix !== true
  )
  $: hasPanelCells = compactMode && (optionalCells.length > 0 || compressionCells.length > 0 || suffixCells.length > 0)

  $: indentStyle = depth > 0 ? `padding-left: calc(${BASE_PADDING_REM}rem + ${depth * INDENT_STEP_REM}rem)` : undefined
</script>

<div
  bind:this={rowElement}
  class="listGrid antiList__row row flex-gap-2 flex-grow"
  class:compactMode
  class:checking={checked}
  class:mListGridSelected={selected}
  class:last
  class:lastCat
  style={indentStyle}
  draggable="true"
  on:contextmenu
  on:focus
  on:mouseenter
  on:mouseover
  on:dragover
  on:dragenter
  on:dragleave
  on:drop
  on:dragstart
>
  <div class="draggable-container">
    <div class="draggable-mark">
      <IconCircles size={'small'} />
    </div>
  </div>
  <div class="flex-center relative mr-1" use:tooltip={{ label: view.string.Select, direction: 'bottom' }}>
    <div class="antiList-cells__notifyCell">
      <div class="antiList-cells__checkCell">
        <CheckBox
          {checked}
          size={'medium'}
          on:value={(event) => dispatch('check', { docs: [docObject], value: event.detail })}
        />
      </div>
      <Component
        is={notification.component.NotificationPresenter}
        showLoading={false}
        props={{ value: docObject, kind: 'table' }}
      />
    </div>
  </div>
  {#if tree}
    <button
      type="button"
      class="tree-toggle"
      class:is-expanded={expanded}
      style:visibility={expandable ? undefined : 'hidden'}
      tabindex={expandable ? 0 : -1}
      aria-expanded={expandable ? expanded : undefined}
      aria-label={expandable ? toggleLabel : undefined}
      on:click={toggleChildren}
    >
      <IconCollapseArrow size={'small'} />
    </button>
  {/if}

  {#each plainCells as plainCell, plainIndex}
    {#if !isHiddenByGrouping(plainCell, groupByKey)}
      {#if plainCell.displayProps?.grow !== true}
        <ListPresenter
          docObject={docObject}
          attributeModel={plainCell}
          {props}
          {readonly}
          {compactMode}
          hideDivider={plainIndex === 0}
          value={readCell(plainCell)}
          onChange={makeEditor(plainCell)}
        />
      {:else}
        {#if !(compactMode && isMobile)}
          {#each suffixCells as suffixCell}
            <ListPresenter
              docObject={docObject}
              attributeModel={suffixCell}
              {props}
              {readonly}
              {compactMode}
              value={readCell(suffixCell)}
              onChange={makeEditor(suffixCell)}
            />
          {/each}
        {/if}
        <GrowPresenter />
        {#if !compactMode}
          <div class="compression-bar">
            {#each compressionCells as compressionCell}
              <ListPresenter
                docObject={docObject}
                attributeModel={compressionCell}
                {props}
                {readonly}
                value={readCell(compressionCell)}
                onChange={makeEditor(compressionCell)}
              />
            {/each}
          </div>
          {#each optionalCells as optionalCell}
            <ListPresenter
              docObject={docObject}
              attributeModel={optionalCell}
              {props}
              {readonly}
              value={readCell(optionalCell)}
              onChange={makeEditor(optionalCell)}
            />
          {/each}
        {/if}
      {/if}
    {/if}
  {/each}

  {#if hasPanelCells}
    <div class="panel-trigger" tabindex="-1">
      <IconCircles size={'small'} />
    </div>
    <div class="hidden-panel" tabindex="-1">
      <div class="header" tabindex="-1" on:click={blurTarget}>
        <IconCircles size={'small'} />
      </div>
      <div class="scroll-box gap-2">
        {#if isMobile}
          {#each suffixCells as suffixCell}
            <ListPresenter
              docObject={docObject}
              attributeModel={suffixCell}
              {props}
              {readonly}
              {compactMode}
              value={readCell(suffixCell)}
              onChange={makeEditor(suffixCell)}
            />
          {/each}
        {/if}
        <div class="compression-bar">
          {#each compressionCells as compressionCell, compressionIndex}
            {#if isShownInPanel(compressionCell, groupByKey)}
              <ListPresenter
                docObject={docObject}
                attributeModel={compressionCell}
                {props}
                {readonly}
                hideDivider={compressionIndex === 0}
                value={readCell(compressionCell)}
                onChange={makeEditor(compressionCell)}
              />
            {/if}
          {/each}
        </div>
        {#each optionalCells as optionalCell, optionalIndex}
          {#if optionalIndex === 0}
            <GrowPresenter />
          {/if}
          {#if isShownInPanel(optionalCell, groupByKey)}
            <ListPresenter
              docObject={docObject}
              attributeModel={optionalCell}
              {props}
              {readonly}
              value={readCell(optionalCell)}
              onChange={makeEditor(optionalCell)}
            />
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .tree-toggle {
    display: flex;
    flex-shrink: 0;
    padding: 0.25rem;
    margin: 0 -0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--theme-dark-color);
  }
  .tree-toggle:hover,
  .tree-toggle:focus-visible {
    color: var(--theme-caption-color);
  }
  .tree-toggle :global(svg) {
    transition: transform 0.15s;
  }
  .tree-toggle.is-expanded :global(svg) {
    transform: rotate(90deg);
  }
</style>
