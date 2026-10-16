<script lang="ts">
  import { ChevronRight, Circle } from '@lucide/svelte'

  export let isOpen: boolean
  export let empty: boolean = false
  export let level: number = 0
</script>

<div
  class="flex items-center justify-center shrink-0 size-6 rounded-md text-muted-foreground transition-transform duration-150"
  class:rotate-90={isOpen && !empty}
  style:margin-left={`${level * 1.5}rem`}
>
  {#if empty}
    <Circle class="size-2 fill-current" />
  {:else}
    <ChevronRight class="size-4" />
  {/if}
</div>
