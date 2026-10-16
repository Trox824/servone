<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { Asset } from '@hcengineering/platform'
  import type { AnySvelteComponent, ButtonSize } from '../original'
  import { Icon } from '../original'
  import { cn } from '../lib/utils'

  export let icon: Asset | AnySvelteComponent | undefined = undefined
  export let size: ButtonSize = 'large'
  export let ghost: boolean = false
  export let selected: boolean = false
  export let primary: boolean = false
  export let disabled: boolean = false
  export let id: string | undefined = undefined

  const dispatch = createEventDispatcher()

  const sizeClasses: Record<ButtonSize, string> = {
    inline: 'size-4',
    'x-small': 'size-5',
    small: 'size-6',
    medium: 'size-7',
    large: 'size-8',
    'x-large': 'size-9'
  }

  function selectOnSpace (event: KeyboardEvent): void {
    if (event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    dispatch('selected')
  }

  $: fillClass = primary
    ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90'
    : selected
      ? 'border-border bg-accent'
      : ghost
        ? 'border-transparent bg-accent/40 hover:bg-accent'
        : 'border-border bg-secondary hover:bg-secondary/80'

  $: circleClass = cn(
    'relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
    sizeClasses[size],
    fillClass,
    disabled ? 'pointer-events-none opacity-50' : ''
  )
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div {id} tabindex="0" class={circleClass} on:click|stopPropagation on:mousemove on:keydown={selectOnSpace}>
  {#if $$slots.content}
    <slot name="content" />
  {:else if icon}
    <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <Icon {icon} size="full" />
    </div>
  {/if}
</div>
