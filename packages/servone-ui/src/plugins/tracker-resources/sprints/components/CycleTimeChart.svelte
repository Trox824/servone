<script lang="ts">
  import type { CycleTime } from '../lib/flow'
  import { fmtDate } from '../ui'

  export let items: Array<CycleTime & { label: string }>
  export let median: number
  export let p85: number
  export let from: number
  export let to: number

  const W = 640
  const H = 180
  const PAD = { l: 32, r: 12, t: 12, b: 24 }

  $: max = Math.max(1, Math.ceil(Math.max(p85, ...items.map((c) => c.days))))
  $: span = Math.max(1, to - from)
  $: x = (t: number): number => PAD.l + ((Math.min(Math.max(t, from), to) - from) / span) * (W - PAD.l - PAD.r)
  $: y = (v: number): number => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max)
  $: ticks = [0, Math.round(max / 2), max]
  const fmtDays = (d: number): string => (d < 1 ? d.toFixed(1) : String(Math.round(d * 10) / 10))
</script>

<svg viewBox="0 0 {W} {H}" class="w-full text-muted-foreground" role="img">
  {#each ticks as t}
    <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="currentColor" stroke-opacity="0.15" />
    <text x={PAD.l - 6} y={y(t) + 3} text-anchor="end" font-size="10" fill="currentColor">{t}d</text>
  {/each}
  <text x={PAD.l} y={H - 6} font-size="10" fill="currentColor">{fmtDate(from)}</text>
  <text x={W - PAD.r} y={H - 6} text-anchor="end" font-size="10" fill="currentColor">{fmtDate(to)}</text>
  <line x1={PAD.l} x2={W - PAD.r} y1={y(p85)} y2={y(p85)} stroke="currentColor" stroke-opacity="0.6" stroke-dasharray="4 4" />
  <line x1={PAD.l} x2={W - PAD.r} y1={y(median)} y2={y(median)} stroke="var(--primary)" stroke-opacity="0.8" />
  {#each items as c (c._id)}
    <circle cx={x(c.doneAt)} cy={y(c.days)} r="3.5" fill="rgb(16 185 129)" fill-opacity="0.85">
      <title>{c.label}: {fmtDays(c.days)}d</title>
    </circle>
  {/each}
</svg>
