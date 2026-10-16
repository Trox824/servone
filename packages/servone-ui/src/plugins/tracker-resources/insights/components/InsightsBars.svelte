<!-- Horizontal bars with the name above each one, so long Vietnamese names are never cut short. -->
<script lang="ts">
  import { OTHER_KEY, type Bar, type Segment } from '../lib/aggregate'

  export let bars: Bar[]
  export let barName: (key: string) => string
  export let segmentName: (key: string) => string
  /** A status segment's own colour; undefined falls back to the chart palette. */
  export let segmentColor: (key: string) => string | undefined
  export let format: (amount: number) => string

  const W = 400
  const ROW = 32
  const NAME_Y = 11
  const BAR_Y = 16
  const BAR_H = 10
  const VALUE_GAP = 4
  const VALUE_ROOM = 44
  const PALETTE_SIZE = 5

  $: segmentKeys = [...new Set(bars.flatMap((bar) => bar.segments.map((segment) => segment.key)))].filter((key) => key !== OTHER_KEY)
  $: max = Math.max(...bars.map((bar) => Math.max(bar.amount, bar.p85 ?? 0, sum(bar.segments))), Number.MIN_VALUE)
  $: scale = (amount: number): number => (amount / max) * (W - VALUE_ROOM)
  $: colorOf = (key: string): string =>
    key === OTHER_KEY
      ? 'var(--muted-foreground)'
      : segmentColor(key) ?? `var(--chart-${(segmentKeys.indexOf(key) % PALETTE_SIZE) + 1})`

  function sum (segments: Segment[]): number {
    return segments.reduce((total, segment) => total + segment.amount, 0)
  }

  function stacked (segments: Segment[]): Array<Segment & { x: number }> {
    let x = 0
    return segments.map((segment) => {
      const placed = { ...segment, x }
      x += scale(segment.amount)
      return placed
    })
  }

  $: hasOther = bars.some((bar) => bar.segments.some((segment) => segment.key === OTHER_KEY))
  $: legend = hasOther ? [...segmentKeys, OTHER_KEY] : segmentKeys
</script>

<figure class="m-0 flex flex-col gap-2">
  <svg viewBox="0 0 {W} {bars.length * ROW}" class="w-full text-muted-foreground" role="img">
    {#each bars as bar, row (bar.key)}
      {@const end = bar.segments.length > 0 ? scale(sum(bar.segments)) : scale(bar.amount)}
      <g transform="translate(0 {row * ROW})">
        <text y={NAME_Y} font-size="11" fill="var(--foreground)">{barName(bar.key)}</text>
        {#if bar.segments.length === 0}
          <rect y={BAR_Y} width={scale(bar.amount)} height={BAR_H} rx="2" fill={bar.key === OTHER_KEY ? 'var(--muted-foreground)' : 'var(--chart-1)'} />
        {:else}
          {#each stacked(bar.segments) as segment (segment.key)}
            <rect x={segment.x} y={BAR_Y} width={scale(segment.amount)} height={BAR_H} fill={colorOf(segment.key)}>
              <title>{segmentName(segment.key)}: {format(segment.amount)}</title>
            </rect>
          {/each}
        {/if}
        {#if bar.p85 !== undefined}
          <line x1={scale(bar.p85)} x2={scale(bar.p85)} y1={BAR_Y - 3} y2={BAR_Y + BAR_H + 3} stroke="currentColor" stroke-width="1.5" />
        {/if}
        <text x={Math.max(end, bar.p85 === undefined ? 0 : scale(bar.p85)) + VALUE_GAP} y={BAR_Y + BAR_H - 1} font-size="10" fill="currentColor" class="tabular-nums">
          {format(bar.amount)}
        </text>
      </g>
    {/each}
  </svg>
  {#if legend.length > 0}
    <figcaption class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {#each legend as key (key)}
        <span class="flex items-center gap-1.5">
          <span class="size-2 shrink-0 rounded-sm" style:background-color={colorOf(key)}></span>{segmentName(key)}
        </span>
      {/each}
    </figcaption>
  {/if}
</figure>
