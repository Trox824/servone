<script lang="ts">
  import type { Issue } from '@hcengineering/tracker'
  import { getClient } from '@hcengineering/presentation'
  import { Label, SelectPopup, showPopup, type SelectPopupValueType } from '@hcengineering/ui'
  import { setEpic } from '../data'
  import { icon, str } from '../plugin'
  import { isEpic } from '../setup'
  import EpicChip from './EpicChip.svelte'

  export let issue: Issue
  export let epic: Issue | undefined
  export let epics: Issue[]
  export let readonly = false

  const client = getClient()

  function pick (e: MouseEvent): void {
    e.stopPropagation()
    if (readonly) return
    const value: SelectPopupValueType[] = [
      ...epics.map((it) => ({ id: it._id, text: `${it.identifier} ${it.title}`, icon: icon.epic, isSelected: it._id === epic?._id })),
      ...(epic !== undefined ? [{ id: null, label: str.RemoveEpic }] : [])
    ]
    showPopup(SelectPopup, { value, searchable: true, placeholder: str.SearchEpics }, e.currentTarget as HTMLElement, async (to: Issue['_id'] | null | undefined) => {
      if (to !== undefined) await setEpic(client, issue, to)
    })
  }
</script>

{#if !isEpic(issue)}
  {#if epic !== undefined}
    <button type="button" class="min-w-0 shrink" on:click={pick}><EpicChip {epic} /></button>
  {:else if !readonly && epics.length > 0}
    <button
      type="button"
      class="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
      on:click={pick}
    >
      + <Label label={str.Epic} />
    </button>
  {/if}
{/if}
