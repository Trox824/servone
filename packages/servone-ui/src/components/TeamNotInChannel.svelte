<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Label } from '../original'
  import { teamStrings, type TeamChoice } from '../lib/team-mentions'
  import Button from './Button.svelte'

  export let count: number
  export let handle: string
  export let canAdd: boolean

  const dispatch = createEventDispatcher<{ close: TeamChoice }>()
</script>

<div class="flex w-96 max-w-[90vw] flex-col gap-4 rounded-xl border border-border bg-background p-4 shadow-lg">
  <p class="text-sm text-foreground">
    <Label label={teamStrings.NotInChannel} params={{ count, handle }} />
  </p>
  <div class="flex justify-end gap-2">
    <Button
      label={teamStrings.SendWithoutThem}
      kind={canAdd ? 'regular' : 'primary'}
      on:click={() => dispatch('close', 'without')}
    />
    {#if canAdd}
      <Button label={teamStrings.AddAndSend} kind="primary" focus on:click={() => dispatch('close', 'add')} />
    {/if}
  </div>
</div>
