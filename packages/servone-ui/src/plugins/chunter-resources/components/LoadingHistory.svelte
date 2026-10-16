<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import { LoaderCircle } from '@lucide/svelte'
  import chunter from '../plugin'

  export let isLoading: boolean = false
</script>

<div class="flex h-10 min-h-10 w-full items-center justify-center text-xs font-medium text-muted-foreground">
  {#if isLoading}
    <LoaderCircle class="mr-1.5 size-3.5 shrink-0 animate-spin" aria-hidden="true" />
    <Label label={chunter.string.LoadingHistory} />
  {/if}
</div>
