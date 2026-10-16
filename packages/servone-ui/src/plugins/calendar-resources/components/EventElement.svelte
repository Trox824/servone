<script lang="ts">
  import calendar, { type CalendarEventPresenter, type Event } from '@hcengineering/calendar'
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { Component, Label, MILLISECONDS_IN_MINUTE, addZero, showPopup, tooltip } from '@hcengineering/ui'
  import love, { type Meeting } from '@hcengineering/love'
  import { Video } from '@lucide/svelte'
  import { Button } from '../../../lib/components/ui/button'
  import { canJoin, peopleInCall } from '../../love-resources/calls/context'
  import { infos } from '../../love-resources/calls/live'
  import view, { type ObjectEditor } from '@hcengineering/view'
  import { showMenu } from '@hcengineering/view-resources'
  import { getContext, onDestroy } from 'svelte'
  import { calendarByIdStore, isVisible } from '../utils'
  import EventPresenter from './EventPresenter.svelte'
  import { LICH_CONTEXT, type CardLook, type LichContext } from '../lich/context'
  import { str } from '../lich/plugin'
  import { textOf } from '../lich/strings'
  import { joinOrOpenMeeting } from '../lich/meeting'
  import { bookingLook } from '../lich/resources/state'
  import { languageStore } from '@hcengineering/theme'

  export let event: Event
  export let size: { width: number, height: number }

  const lichContext = getContext<LichContext | undefined>(LICH_CONTEXT)
  const cardOf = lichContext?.cardOf
  const hierarchy = getClient().getHierarchy()
  const PLAIN_CLASSES: Array<Ref<Class<Doc>>> = [
    calendar.class.Event,
    calendar.class.ReccuringEvent,
    calendar.class.ReccuringInstance
  ]
  const COMPACT_HEIGHT = 42
  const SHORT_MINUTES = 25
  const TINY_WIDTH = 44
  const BUTTON_MIN_WIDTH = 120
  const CLOCK_REFRESH_MS = 60 * 1000

  let root: HTMLElement | undefined
  let now = Date.now()
  const clock = setInterval(() => {
    now = Date.now()
  }, CLOCK_REFRESH_MS)
  onDestroy(() => {
    clearInterval(clock)
  })

  function formatTime (timestamp: number): string {
    const moment = new Date(timestamp)
    return `${addZero(moment.getHours())}:${addZero(moment.getMinutes())}`
  }

  $: look = lichContext !== undefined && cardOf !== undefined ? ($cardOf as (e: Event) => CardLook)(event) : undefined
  $: lang = $languageStore === 'vi' ? 'vi' : 'en'
  $: t = textOf(lang)
  $: compact = size.height < COMPACT_HEIGHT || event.allDay
  $: short = event.dueDate - event.date < SHORT_MINUTES * MILLISECONDS_IN_MINUTE
  $: tiny = size.width < TINY_WIDTH
  $: visible = look !== undefined ? look.mask === 'full' : isVisible(event, $calendarByIdStore)
  $: draft = look?.isDraft ?? false
  $: pendingBooking = look !== undefined && visible && !draft && (bookingLook(event)?.isPending ?? false)
  $: dashed =
    look !== undefined && !draft && (look.answer === 'pending' || look.answer === 'tentative' || pendingBooking)
  $: plainClass = PLAIN_CLASSES.includes(event._class)
  $: isMeeting = look !== undefined && visible && plainClass && hierarchy.hasMixin(event, love.mixin.Meeting)
  $: room = isMeeting ? hierarchy.as<Doc, Meeting>(event, love.mixin.Meeting).room : undefined
  $: callCount = isMeeting && room !== undefined ? peopleInCall($infos, room).length : 0
  $: joinable = isMeeting && canJoin(event.date, event.dueDate, callCount, now)
  $: hasButtonRoom = isMeeting && size.width >= BUTTON_MIN_WIDTH
  $: startEnd = `${formatTime(event.date)}–${formatTime(event.dueDate)}`
  $: ariaLabel =
    look !== undefined && (tiny || (short && compact))
      ? visible
        ? event.title !== '' ? event.title : t('NoTitle')
        : t('Busy')
      : undefined
  $: tooltipOptions =
    lichContext === undefined
      ? { component: EventPresenter, props: { value: event, hideDetails: !visible } }
      : undefined
  $: presenter = hierarchy.classHierarchyMixin<Doc, CalendarEventPresenter>(
    event._class,
    calendar.mixin.CalendarEventPresenter
  )?.presenter

  function activate (): void {
    if (draft) return
    if (lichContext !== undefined) {
      if (root !== undefined) lichContext.openEvent(event, root)
      return
    }
    if (!visible) return
    const editor = hierarchy.classHierarchyMixin<Doc, ObjectEditor>(event._class, view.mixin.ObjectEditor)?.editor
    if (editor !== undefined) showPopup(editor, { object: event })
  }

  function onClick (mouseEvent: MouseEvent): void {
    mouseEvent.stopPropagation()
    activate()
  }

  function onKeydown (keyEvent: KeyboardEvent): void {
    if (lichContext === undefined) return
    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
      keyEvent.preventDefault()
      activate()
    }
  }

  function onContextMenu (mouseEvent: MouseEvent): void {
    if (draft || (lichContext !== undefined && !visible)) return
    showMenu(mouseEvent, { object: event })
  }

  function onJoinClick (mouseEvent: MouseEvent): void {
    mouseEvent.stopPropagation()
    joinOrOpenMeeting(event, joinable)
  }

  function onJoinKeydown (keyEvent: KeyboardEvent): void {
    keyEvent.stopPropagation()
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  bind:this={root}
  class="event-container"
  class:is-compact={compact}
  class:is-tiny={tiny}
  class:is-dashed={dashed}
  class:is-declined={look?.isDeclined === true}
  class:is-free={look?.isFree === true}
  class:is-draft={draft}
  class:is-meeting={isMeeting}
  class:is-tinted={look?.color !== undefined && look.color !== ''}
  style:--lich-color={look?.color}
  data-lich-draft={draft ? '' : undefined}
  role={lichContext !== undefined ? 'button' : undefined}
  tabindex={lichContext !== undefined ? 0 : undefined}
  aria-label={ariaLabel}
  use:tooltip={tooltipOptions}
  on:click={onClick}
  on:keydown={onKeydown}
  on:contextmenu|preventDefault={onContextMenu}
>
  {#if !tiny}
    {#if look !== undefined && !visible}
      <span class="busy-label"><Label label={str.Busy} /></span>
    {:else if isMeeting}
      <div class="meeting-row">
        <span class="title">{event.title !== '' ? event.title : t('NoTitle')}</span>
        {#if compact}
          <span class="time">{startEnd}</span>
        {/if}
        {#if hasButtonRoom}
          <Button
            size="xs"
            variant={joinable ? 'default' : 'outline'}
            class="ml-auto"
            onclick={onJoinClick}
            onkeydown={onJoinKeydown}
          >
            {joinable ? t('JoinMeeting') : t('OpenMeeting')}
          </Button>
        {/if}
      </div>
      {#if !compact}
        <div class="meeting-time">
          <Video size={12} class="shrink-0" />
          <span class="time">{startEnd}</span>
        </div>
      {/if}
    {:else if look !== undefined && plainClass}
      {#if !short}
        {#if draft && event.title.trim() === ''}
          <span class="title placeholder">{t('NoTitle')}</span>
        {:else}
          <span class="title">{event.title}</span>
        {/if}
      {/if}
      {#if !compact}
        <span class="time">{startEnd}</span>
      {/if}
    {:else if presenter !== undefined}
      <Component
        is={presenter}
        props={{ event, narrow: short, oneRow: compact, hideDetails: !visible }}
      />
    {/if}
  {/if}
</div>

<style>
  .event-container {
    flex-grow: 1;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 8px;
    font-size: 12px;
    line-height: 1.25;
    color: var(--foreground);
    cursor: pointer;
    outline: none;
    box-sizing: border-box;
    background: var(--calendar-event-back-color);
    border: 1px solid var(--calendar-event-border-color);
    border-left: 3px solid var(--calendar-event-handle-color);
    border-radius: calc(var(--radius) - 2px);
  }
  .event-container:hover {
    background: color-mix(in oklch, var(--calendar-event-handle-color) 24%, var(--background));
  }
  .event-container:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }
  .event-container.is-compact {
    justify-content: center;
    padding-top: 0;
    padding-bottom: 0;
  }

  .event-container.is-tinted {
    background: color-mix(in srgb, var(--lich-color) 14%, var(--background));
    border-color: color-mix(in srgb, var(--lich-color) 35%, transparent);
    border-left-color: var(--lich-color);
  }
  .event-container.is-tinted:hover {
    background: color-mix(in srgb, var(--lich-color) 22%, var(--background));
  }

  .event-container.is-free,
  .event-container.is-free:hover {
    background: var(--background);
    border-color: var(--lich-color);
  }

  .event-container.is-meeting {
    background: color-mix(in oklch, var(--primary) 9%, var(--background));
    border: 1px solid color-mix(in oklch, var(--primary) 30%, transparent);
  }
  .event-container.is-meeting:hover {
    background: color-mix(in oklch, var(--primary) 14%, var(--background));
  }

  .event-container.is-dashed,
  .event-container.is-dashed:hover {
    background: var(--background);
    border-top-style: dashed;
    border-right-style: dashed;
    border-bottom-style: dashed;
  }

  .event-container.is-declined {
    opacity: 0.6;
  }
  .event-container.is-declined .title {
    text-decoration: line-through;
  }

  .event-container.is-draft,
  .event-container.is-draft:hover {
    background: color-mix(in oklch, var(--primary) 10%, var(--background));
    border: 2px dashed var(--primary);
    cursor: default;
  }

  .title {
    font-weight: 500;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .time {
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meeting-row .time {
    flex-shrink: 0;
  }
  .placeholder {
    color: var(--muted-foreground);
    font-weight: 400;
  }
  .busy-label {
    color: var(--muted-foreground);
    font-size: 12px;
  }
  .meeting-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .meeting-time {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    color: var(--muted-foreground);
  }
</style>
