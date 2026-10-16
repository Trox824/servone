<script lang="ts">
  import { createEventDispatcher, getContext } from 'svelte'
  import type { Event } from '@hcengineering/calendar'
  import love from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import { Video } from '@lucide/svelte'
  import { LICH_CONTEXT, type LichContext } from '../context'
  import { textOf } from '../strings'
  import { timeRange } from '../lib/format'
  import type { Lang } from '../lib/types'
  import { bookingLook } from '../resources/state'
  import { resourceTextOf } from '../resources/strings'

  export let event: Event
  export let lang: Lang
  export let withTime: boolean

  const dispatch = createEventDispatcher<{ open: { event: Event, target: HTMLElement } }>()
  const { cardOf } = getContext<LichContext>(LICH_CONTEXT)
  $: t = textOf(lang)
  $: look = $cardOf(event)
  $: booking = look.mask === 'full' && !look.isDraft ? bookingLook(event) : undefined
  $: isDashed = !look.isDraft && (look.answer === 'pending' || look.answer === 'tentative' || booking?.isPending === true)
  $: isDimmed = look.isDeclined || booking?.isVoid === true
  $: isFilled = !withTime && !look.isFree && !look.isDraft
  $: isMeeting = look.mask === 'full' && getClient().getHierarchy().hasMixin(event, love.mixin.Meeting)
  $: borderColor = look.isDraft ? 'var(--primary)' : isDashed || look.isFree ? look.color : 'transparent'
</script>

<!-- The tooltip is set only when mask is full: a masked colleague event must not leak its title. -->
<!-- justify-start and the explicit border override Huly's global button reset, which centers content. -->
<button
  type="button"
  class="lich-chip relative z-[1] flex h-5 w-full min-w-0 items-center justify-start gap-1.5 rounded-md border px-1.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring {isDashed || look.isDraft ? 'border-dashed' : ''} {isFilled ? 'is-filled' : ''} {isDimmed ? 'opacity-60' : ''}"
  style:--c={look.color}
  data-lich-draft={look.isDraft ? '' : undefined}
  style:border-color={borderColor}
  title={look.mask === 'full' && !look.isDraft ? (look.answer === 'pending' ? `${event.title} (${t('NoReply')})` : event.title) : undefined}
  on:click|stopPropagation={(e) => { if (!look.isDraft) dispatch('open', { event, target: e.currentTarget }) }}
>
  {#if !isFilled}<span class="size-1.5 shrink-0 rounded-full" style:background={look.isDraft ? 'var(--primary)' : look.color}></span>{/if}
  {#if withTime}<span class="shrink-0 tabular-nums text-muted-foreground">{timeRange(event, lang)}</span>{/if}
  {#if isMeeting}<Video class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />{/if}
  <span class="min-w-0 truncate font-medium {isDimmed ? 'line-through' : ''}">
    {#if look.mask !== 'full'}{t('Busy')}
    {:else if look.isDraft && event.title.trim() === ''}<span class="text-muted-foreground">{t('NoTitle')}</span>
    {:else}{event.title}{/if}
  </span>
  {#if booking !== undefined && booking.state !== 'confirmed'}
    <span class="min-w-0 shrink-[2] truncate text-muted-foreground">{resourceTextOf(lang)(booking.state)}</span>
  {/if}
</button>

<style>
  .lich-chip {
    background: transparent;
  }
  .lich-chip:hover {
    background: color-mix(in srgb, var(--c) 12%, transparent);
  }
  .lich-chip.is-filled {
    background: color-mix(in srgb, var(--c) 16%, transparent);
  }
  .lich-chip.is-filled:hover {
    background: color-mix(in srgb, var(--c) 24%, transparent);
  }
</style>
