<script lang="ts">
  import type { Issue } from '@hcengineering/tracker'
  import { getClient } from '@hcengineering/presentation'
  import { showPopup } from '@hcengineering/ui'
  import { setPoints } from '../data'
  import { formatPoints } from '../lib/scale'
  import type { EstimateScale } from '../lib/types'
  import { issuePoints } from '../schema'
  import PointsPicker from './PointsPicker.svelte'

  export let issue: Issue
  export let scale: EstimateScale
  export let readonly = false

  const client = getClient()
  $: value = issuePoints(issue)

  function open (e: MouseEvent): void {
    e.stopPropagation()
    if (readonly) return
    showPopup(PointsPicker, { value, scale }, e.currentTarget as HTMLElement, async (res: number | null | undefined) => {
      if (res !== undefined && res !== value) await setPoints(client, issue, res)
    })
  }
</script>

{#if scale !== 'off'}
  <button
    type="button"
    class="inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs tabular-nums {value === null
      ? 'border border-dashed text-muted-foreground'
      : 'bg-muted text-foreground'} {readonly ? 'cursor-default' : 'hover:bg-accent'}"
    on:click={open}
  >
    {formatPoints(value, scale)}
  </button>
{/if}
