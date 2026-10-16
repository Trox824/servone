<!-- Story points field in the upstream Create issue dialog; the dialog writes the value via ../data.ts#setNewIssuePoints. -->
<script lang="ts">
  import type { Project } from '@hcengineering/tracker'
  import { Button, eventToHTMLElement, showPopup } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { formatPoints } from '../lib/scale'
  import { str } from '../plugin'
  import { projectSettings } from '../schema'
  import { isScrumProject } from '../setup'
  import PointsPicker from './PointsPicker.svelte'

  export let project: Project | undefined
  export let points: number | null = null

  const dispatch = createEventDispatcher<{ change: number | null }>()

  $: scale = projectSettings(project).scale
  $: isShown = isScrumProject(project) && scale !== 'off'
  $: if (!isShown && points !== null) dispatch('change', null)

  function open (ev: MouseEvent): void {
    showPopup(PointsPicker, { value: points, scale }, eventToHTMLElement(ev), (picked: number | null | undefined) => {
      if (picked !== undefined) dispatch('change', picked)
    })
  }
</script>

{#if isShown}
  {#if points === null}
    <Button kind={'regular'} size={'large'} label={str.StoryPoints} on:click={open} />
  {:else}
    <Button kind={'regular'} size={'large'} showTooltip={{ label: str.StoryPoints }} on:click={open}>
      <span slot="content" class="tabular-nums">{formatPoints(points, scale)}</span>
    </Button>
  {/if}
{/if}
