<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import type { BurndownPoint } from '../lib/report'
  import { str } from '../plugin'
  import { fmtDate } from '../ui'

  export let points: BurndownPoint[]
  export let mode: 'burndown' | 'burnup' = 'burndown'
  export let width = 640
  export let height = 220

  $: W = width
  $: H = height
  const LABEL_SLOT = 56
  const PAD = { l: 32, r: 12, t: 12, b: 24 }

  $: max = Math.max(1, ...points.map((p) => Math.max(p.ideal, p.remaining ?? 0, p.scope ?? 0)))
  $: step = points.length > 1 ? (W - PAD.l - PAD.r) / (points.length - 1) : 0
  $: x = (i: number): number => PAD.l + i * step
  $: y = (v: number): number => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max)
  $: up = mode === 'burnup'
  $: committed = points[0]?.ideal ?? 0
  /** The line that moves: remaining (burndown) or completed (burnup). */
  $: line = (p: BurndownPoint): number => (up ? (p.scope ?? 0) - (p.remaining ?? 0) : p.remaining ?? 0)
  $: guide = (p: BurndownPoint): number => (up ? committed - p.ideal : p.ideal)
  $: known = points.map((p, i) => ({ ...p, i })).filter((p) => p.remaining !== null)
  $: remainingPath = known
    .map((p, j) => (j === 0 ? `M${x(p.i)},${y(line(p))}` : `H${x(p.i)}V${y(line(p))}`))
    .join(' ')
  $: scopePath = known.map((p, j) => `${j === 0 ? 'M' : 'L'}${x(p.i)},${y(p.scope ?? 0)}`).join(' ')
  $: idealPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(guide(p))}`).join(' ')
  $: ticks = [0, Math.round(max / 2), Math.round(max)]
  $: labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor((W - PAD.l - PAD.r) / LABEL_SLOT))))
</script>

<figure class="flex shrink-0 flex-col gap-2">
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
    <path d={idealPath} fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-dasharray="4 4" />
    {#if known.length > 0}
      <path d={scopePath} fill="none" stroke="currentColor" stroke-width="1.5" class="text-amber-500" />
      <path d={remainingPath} fill="none" stroke="var(--primary)" stroke-width="2" />
      {#each known as p}
        <circle cx={x(p.i)} cy={y(line(p))} r="2.5" fill="var(--primary)">
          <title>{fmtDate(p.day)}: {line(p)}</title>
        </circle>
      {/each}
    {/if}
  </svg>
  <figcaption class="flex gap-4 text-xs text-muted-foreground">
    <span class="flex items-center gap-1.5"><span class="h-0.5 w-4 bg-primary"></span><Label label={up ? str.Completed : str.Remaining} /></span>
    <span class="flex items-center gap-1.5"><span class="h-0.5 w-4 bg-amber-500"></span><Label label={str.Scope} /></span>
    <span class="flex items-center gap-1.5"><span class="w-4 border-t border-dashed border-muted-foreground"></span><Label label={str.Guideline} /></span>
  </figcaption>
</figure>
