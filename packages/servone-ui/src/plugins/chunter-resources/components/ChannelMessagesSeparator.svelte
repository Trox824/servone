<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { Label } from '@hcengineering/ui'

  export let label: IntlString
  export let params: any = undefined
  export let element: HTMLDivElement | undefined | null = undefined
</script>

<div bind:this={element} class="flex w-full shrink-0 items-center gap-2 whitespace-nowrap pr-4">
  <div class="h-px grow bg-border"></div>
  <span
    class="inline-flex shrink-0 items-center rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium leading-4 text-primary-foreground"
  >
    <Label {label} {params} />
  </span>
</div>
