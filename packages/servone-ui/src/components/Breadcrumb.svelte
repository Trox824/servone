<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import type { ComponentType } from 'svelte'
  import type { AnySvelteComponent } from '../original'
  import { Icon, Label } from '../original'
  import { cn } from '../lib/utils'

  export let icon: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let iconProps: any | undefined = undefined
  export let iconWidth: string | undefined = undefined
  export let iconMargin: string | undefined = undefined
  export let withoutIconBackground: boolean = false
  export let label: IntlString | undefined = undefined
  export let title: string | undefined = undefined
  export let size: 'large' | 'small'
  export let isCurrent: boolean = false

  $: hasIconTile = size === 'large' && icon !== undefined

  $: textSizeClass = size === 'small' ? 'text-xs' : isCurrent ? 'text-[15px]' : 'text-sm'

  $: segmentClass = cn(
    'inline-flex items-center gap-2 min-w-0 rounded-md px-1',
    textSizeClass,
    isCurrent
      ? 'text-foreground font-semibold cursor-default'
      : 'text-muted-foreground hover:text-foreground'
  )

  $: tileClass = cn(
    'flex items-center justify-center shrink-0 rounded-md size-6 text-muted-foreground',
    !withoutIconBackground && !isCurrent && 'bg-muted'
  )
</script>

<button type="button" class={segmentClass} on:click>
  {#if hasIconTile}
    <span class={tileClass} style:width={iconWidth} style:margin={iconMargin}>
      <Icon {icon} size={isCurrent ? 'medium' : 'small'} {iconProps} />
    </span>
  {/if}
  <span class="truncate">
    {#if label !== undefined}<Label {label} />{/if}
    {#if title !== undefined}{title}{/if}
  </span>
</button>
