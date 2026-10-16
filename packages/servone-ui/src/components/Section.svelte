<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import type { AnySvelteComponent } from '../original'
  import { Icon, Label } from '../original'

  export let id: string | undefined = undefined
  export let label: IntlString
  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let showHeader: boolean = true
  export let spaceBeforeContent: boolean = false
  export let high: boolean = false
  export let invisible: boolean = false
</script>

<div {id} class="flex min-h-0 shrink-0 flex-col">
  {#if showHeader}
    <div
      class="flex items-center gap-2 border-b border-border font-medium text-foreground"
      class:h-10={!high}
      class:min-h-10={!high}
      class:text-sm={!high}
      class:h-14={high}
      class:min-h-14={high}
      class:pr-4={high}
      class:text-base={high}
      class:mb-3={spaceBeforeContent}
      class:invisible
    >
      {#if icon}
        <div class="flex h-8 shrink-0 items-center justify-center text-muted-foreground">
          <Icon {icon} size={'small'} />
        </div>
      {/if}
      <span class="flex min-w-0 items-center overflow-label"><Label {label} /></span>
      <slot name="header" />
    </div>
  {/if}
  <slot name="content" />
</div>
