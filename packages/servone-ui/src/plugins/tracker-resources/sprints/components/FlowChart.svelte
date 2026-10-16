<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import type { FlowPoint } from '../lib/flow'
  import { str } from '../plugin'
  import { fmtDate } from '../ui'

  export let points: FlowPoint[]

  const W = 640
  const H = 220
  const PAD = { l: 32, r: 12, t: 12, b: 24 }

  $: max = Math.max(1, ...points.map((p) => p.todo + p.active + p.done))
  $: step = points.length > 1 ? (W - PAD.l - PAD.r) / (points.length - 1) : 0
  $: x = (i: number): number => PAD.l + i * step
  $: y = (v: number): number => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max)
  /** The band between two cumulative lines, as a closed path. */
  $: band = (lower: (p: FlowPoint) => number, upper: (p: FlowPoint) => number): string => {
    if (points.length === 0) return ''
    const top = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(upper(p))}`).join(' ')
    const bottom = [...points]
      .map((p, i) => ({ p, i }))
      .reverse()
      .map(({ p, i }) => `L${x(i)},${y(lower(p))}`)
      .join(' ')
    return `${top} ${bottom} Z`
  }
  $: ticks = [0, Math.round(max / 2), Math.round(max)]
  $: labelEvery = Math.max(1, Math.ceil(points.length / 8))
</script>

<figure class="m-0 flex shrink-0 flex-col gap-2">
  {#if points.length < 2}
    <p class="text-xs text-muted-foreground"><Label label={str.FlowNeedsDays} /></p>
  {:else}
    <svg viewBox="0 0 {W} {H}" class="w-full text-muted-foreground" role="img">
      {#each ticks as t}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="currentColor" stroke-opacity="0.15" />
        <text x={PAD.l - 6} y={y(t) + 3} text-anchor="end" font-size="10" fill="currentColor">{t}</text>
      {/each}
      {#each points as p, i}
        {#if i === points.length - 1 || (i % labelEvery === 0 && points.length - 1 - i >= labelEvery / 2 + 0.5)}
          <text
            x={x(i)}
            y={H - 6}
            text-anchor={i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}
            font-size="10"
            fill="currentColor">{fmtDate(p.day)}</text
          >
        {/if}
      {/each}
      <path d={band(() => 0, (p) => p.done)} fill="rgb(16 185 129 / 0.55)" />
      <path d={band((p) => p.done, (p) => p.done + p.active)} fill="var(--primary)" fill-opacity="0.55" />
      <path d={band((p) => p.done + p.active, (p) => p.done + p.active + p.todo)} fill="currentColor" fill-opacity="0.25" />
    </svg>
  {/if}
  <figcaption class="flex gap-4 text-xs text-muted-foreground">
    <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm bg-muted-foreground/40"></span><Label label={str.SplitTodo} /></span>
    <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm bg-primary/60"></span><Label label={str.SplitActive} /></span>
    <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm bg-emerald-500/60"></span><Label label={str.SplitDone} /></span>
  </figcaption>
</figure>
