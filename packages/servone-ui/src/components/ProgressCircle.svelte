<script lang="ts">
  import { themeStore } from '@hcengineering/theme'
  import { getPlatformColor, type IconSize } from '../original'

  export let value: number
  export let min: number = 0
  export let max: number = 100
  export let color: number = 5
  export let size: IconSize = 'small'
  export let primary: boolean = false

  value = Math.min(Math.max(value, min), max)

  const RING_RADIUS = 7
  const CAP_ALLOWANCE = 1
  const usableLength = Math.PI * RING_RADIUS * 2 - CAP_ALLOWANCE
  const sizeClassBySize: Record<string, string> = {
    inline: 'size-3',
    tiny: 'size-3',
    'xx-small': 'size-3',
    card: 'size-4',
    'x-small': 'size-4',
    small: 'size-4',
    medium: 'size-5',
    large: 'size-6',
    'x-large': 'size-8',
    full: 'size-full'
  }
  const transitionRule =
    'transition: transform 0.6s ease, stroke-dashoffset 0.6s ease, stroke-dasharray 0.6s ease, opacity 0.6s ease;'

  $: filledLength = ((value - min) * usableLength) / (max - min)
  $: isEmpty = filledLength === 0
  $: sizeClass = sizeClassBySize[size] ?? 'size-4'
  $: arcStroke = primary ? 'var(--primary)' : getPlatformColor(color, $themeStore.dark)
  $: arcStyle = [
    `stroke: ${arcStroke}`,
    `opacity: ${isEmpty ? 0 : 1}`,
    'transform: rotate(-82deg)',
    'transform-origin: center',
    `stroke-dasharray: ${usableLength}`,
    `stroke-dashoffset: ${isEmpty ? usableLength : usableLength - filledLength + 1}`,
    transitionRule
  ].join('; ')
  $: trackStyle = [
    'stroke: var(--border)',
    'opacity: 0.5',
    `transform: rotate(${-78 + ((filledLength + 1) * 360) / (usableLength + 1)}deg)`,
    'transform-origin: center',
    `stroke-dasharray: ${usableLength}`,
    `stroke-dashoffset: ${isEmpty ? 0 : filledLength + 3}`,
    transitionRule
  ].join('; ')
</script>

<svg class={sizeClass} viewBox="0 0 16 16" fill="none" stroke-width="2" stroke-linecap="round">
  <circle cx="8" cy="8" r={RING_RADIUS} style={trackStyle} />
  <circle cx="8" cy="8" r={RING_RADIUS} style={arcStyle} />
</svg>
