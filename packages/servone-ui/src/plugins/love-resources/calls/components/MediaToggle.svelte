<script lang="ts">
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { tooltip } from '@hcengineering/ui'
  import { ChevronUp } from '@lucide/svelte'
  import type { Component } from 'svelte'

  export let icon: Component
  export let label: string
  export let optionsLabel: string
  export let tone: 'neutral' | 'danger' | 'active' = 'neutral'
  export let keys: string[] | undefined = undefined
  export let disabled = false
  export let onToggle: (e: MouseEvent) => void
  export let onOptions: (e: MouseEvent) => void

  const TONE_CLASS = {
    neutral: 'bg-secondary text-secondary-foreground hover:bg-accent',
    danger: 'bg-destructive text-white hover:bg-destructive/85',
    active: 'bg-primary text-primary-foreground hover:bg-primary/85'
  }
</script>

<div class="inline-flex items-center rounded-full bg-secondary p-0.5" role="group" aria-label={label}>
  <button
    type="button"
    class="grid size-10 place-items-center rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 [&_svg]:size-5 {TONE_CLASS[tone]}"
    aria-label={label}
    {disabled}
    use:tooltip={{ label: getEmbeddedLabel(label), keys, direction: 'top' }}
    on:click|stopPropagation={onToggle}
  >
    <svelte:component this={icon} aria-hidden="true" />
  </button>
  <button
    type="button"
    class="grid h-10 w-7 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 [&_svg]:size-4"
    aria-label={optionsLabel}
    aria-haspopup="menu"
    {disabled}
    use:tooltip={{ label: getEmbeddedLabel(optionsLabel), direction: 'top' }}
    on:click|stopPropagation={onOptions}
  >
    <ChevronUp aria-hidden="true" />
  </button>
</div>
