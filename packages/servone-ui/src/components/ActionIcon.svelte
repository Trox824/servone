<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import type { ComponentType } from 'svelte'
  import type { AnySvelteComponent, TooltipAlignment } from '../original'
  import { tooltip, Icon } from '../original'
  import { cn } from '../lib/utils'
  import { buttonVariants } from '../lib/components/ui/button'

  export let label: IntlString = '' as IntlString
  export let labelProps: any = undefined
  export let direction: TooltipAlignment | undefined = undefined
  export let icon: Asset | AnySvelteComponent | ComponentType
  export let iconProps: any | undefined = undefined
  export let size: 'x-small' | 'small' | 'medium' | 'large'
  export let action: (ev: MouseEvent) => Promise<void> | void = async () => {}
  export let invisible: boolean = false
  export let disabled: boolean = false
  export let keys: string[] | undefined = undefined

  const squareClassBySize = {
    'x-small': 'h-3.5 w-3.5',
    small: 'h-4 w-4',
    medium: 'h-5 w-5',
    large: 'h-6 w-6'
  } satisfies Record<typeof size, string>

  let accessibleName: string | undefined = undefined

  $: if (label !== '') {
    translateCB(label, labelProps ?? {}, $themeStore.language, (translated) => {
      accessibleName = translated
    })
  } else {
    accessibleName = undefined
  }

  $: buttonClass = cn(
    buttonVariants({ variant: 'ghost', size: 'icon' }),
    'p-0 shadow-none',
    squareClassBySize[size]
  )
</script>

<button
  type="button"
  tabindex="0"
  class={buttonClass}
  {disabled}
  aria-label={accessibleName}
  use:tooltip={{ label, direction, keys, props: labelProps }}
  on:click|stopPropagation|preventDefault={action}
  on:contextmenu
>
  <span class="pointer-events-none flex items-center justify-center {invisible ? 'invisible' : ''}">
    <Icon {icon} {size} {iconProps} />
  </span>
</button>
