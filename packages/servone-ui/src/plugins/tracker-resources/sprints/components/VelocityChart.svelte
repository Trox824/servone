<script lang="ts">
  import { Label } from '@hcengineering/ui'
  import type { VelocityEntry } from '../lib/report'
  import { str } from '../plugin'

  export let entries: VelocityEntry[]

  const W = 640
  const H = 200
  const PAD = { l: 32, r: 12, t: 12, b: 28 }

  $: max = Math.max(1, ...entries.map((e) => Math.max(e.committed, e.completed)))
  $: slot = entries.length > 0 ? (W - PAD.l - PAD.r) / entries.length : 0
  $: bar = Math.min(28, slot / 3)
  $: h = (v: number): number => ((H - PAD.t - PAD.b) * v) / max
  $: base = H - PAD.b
</script>

<figure class="flex shrink-0 flex-col gap-2">
  <svg viewBox="0 0 {W} {H}" class="w-full text-muted-foreground" role="img">
    <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} stroke="currentColor" stroke-opacity="0.3" />
    {#each entries as e, i}
      {@const cx = PAD.l + slot * i + slot / 2}
      <rect x={cx - bar - 1} y={base - h(e.committed)} width={bar} height={h(e.committed)} rx="2" fill="currentColor" fill-opacity="0.3">
        <title>{e.label}: {e.committed}</title>
      </rect>
      <rect x={cx + 1} y={base - h(e.completed)} width={bar} height={h(e.completed)} rx="2" fill="var(--primary)">
        <title>{e.label}: {e.completed}</title>
      </rect>
      <text x={cx} y={H - 10} text-anchor="middle" font-size="10" fill="currentColor">{e.label.length > 16 ? e.label.slice(0, 15) + '…' : e.label}</text>
    {/each}
  </svg>
  <figcaption class="flex gap-4 text-xs text-muted-foreground">
    <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-muted-foreground/30"></span><Label label={str.Committed} /></span>
    <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-primary"></span><Label label={str.Completed} /></span>
  </figcaption>
</figure>
