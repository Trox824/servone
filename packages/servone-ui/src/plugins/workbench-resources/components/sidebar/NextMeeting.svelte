<!-- The meeting in progress or starting within 30 minutes, with what to read before joining. -->
<script lang="ts">
  import calendar, { type Event } from '@hcengineering/calendar'
  import contact, { getFirstName, type Person } from '@hcengineering/contact'
  import { getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import type { Ref } from '@hcengineering/core'
  import love from '@hcengineering/love'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { markupToText } from '@hcengineering/text'
  import tracker, { type Issue } from '@hcengineering/tracker'
  import { showPanel } from '@hcengineering/ui'
  import { Video } from '@lucide/svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import PersonAvatar from '../../../calendar-resources/lich/components/PersonAvatar.svelte'
  import { timeRange } from '../../../calendar-resources/lich/lib/format'
  import { answers, occurrenceOf, seriesId } from '../../../calendar-resources/lich/lib/rsvp'
  import type { Lang } from '../../../calendar-resources/lich/lib/types'
  import { joinOrOpenMeeting } from '../../../calendar-resources/lich/meeting'
  import AvatarStack from '../../../love-resources/calls/components/AvatarStack.svelte'
  import { canJoin, peopleInCall } from '../../../love-resources/calls/context'
  import { infos } from '../../../love-resources/calls/live'
  import { statusKindOf } from '../../../tracker-resources/sprints/data'
  import { textOf } from './strings'
  import { agendaLines, openEarlierItems, prepMeeting } from './today'

  export let events: Event[]
  export let stored: Event[]
  export let now: number
  export let lang: Lang

  const MINUTE_MS = 60 * 1000

  const client = getClient()
  const hierarchy = client.getHierarchy()

  $: t = textOf(lang)
  $: meeting = prepMeeting(events.filter((e) => hierarchy.hasMixin(e, love.mixin.Meeting)), now)
  $: room = meeting === undefined ? undefined : hierarchy.as(meeting, love.mixin.Meeting).room
  $: inCall = room === undefined ? [] : peopleInCall($infos, room)
  $: isJoinable = meeting !== undefined && canJoin(meeting.date, meeting.dueDate, inCall.length, now)
  $: timing = meeting === undefined ? '' : timingText(meeting, now)

  function timingText (e: Event, clock: number): string {
    if (clock < e.date) {
      const minutes = Math.ceil((e.date - clock) / MINUTE_MS)
      return t('StartsIn', { minutes })
    }
    return t('EndsIn', { minutes: Math.max(1, Math.ceil((e.dueDate - clock) / MINUTE_MS)) })
  }

  let socialToPerson = new Map<string, string>()
  createQuery().query(contact.class.SocialIdentity, { attachedToClass: contact.class.Person }, (identities) => {
    socialToPerson = new Map(identities.map((identity) => [identity._id, identity.attachedTo]))
  })
  const personOf = (socialId: string): string | undefined => socialToPerson.get(socialId)

  let copies: Event[] = []
  const copiesQuery = createQuery()
  $: series = meeting === undefined ? undefined : seriesId(meeting)
  $: if (series !== undefined) {
    copiesQuery.query(calendar.class.Event, { eventId: series }, (found) => { copies = found })
  } else {
    copiesQuery.unsubscribe()
    copies = []
  }
  $: occurrence = meeting !== undefined && copies[0] !== undefined ? occurrenceOf(meeting, copies[0], stored) : undefined
  $: replies = answers(copies, personOf, occurrence)
  $: declined = (meeting?.participants ?? []).filter((person) => replies.get(person) === 'declined')

  type ActionItem = Pick<Issue, '_id' | 'identifier' | 'title' | 'status' | 'createdOn' | 'modifiedOn'>
  let actionItems: ActionItem[] = []
  const actionItemsQuery = createQuery()
  $: isRecurring = meeting?.recurringEventId !== undefined
  $: if (isRecurring && copies.length > 0) {
    actionItemsQuery.query(
      tracker.class.Issue,
      { 'relations._id': { $in: copies.map((copy) => copy._id) } },
      (found) => { actionItems = found },
      { projection: { identifier: 1, title: 1, status: 1, createdOn: 1, modifiedOn: 1 } }
    )
  } else {
    actionItemsQuery.unsubscribe()
    actionItems = []
  }
  const isClosed = (item: ActionItem): boolean => ['done', 'canceled'].includes(statusKindOf(client, item.status))
  $: openItems = meeting === undefined ? [] : openEarlierItems(actionItems, meeting.date, isClosed)

  $: agenda = agendaLines(meeting === undefined ? '' : markupToText(meeting.description))

  $: people = getPersonByPersonRefStore(declined)
  function firstNameOf (person: Ref<Person>): string {
    const found = $people.get(person)
    return found === undefined ? '' : getFirstName(found.name)
  }
</script>

{#if meeting !== undefined}
  <section class="grid gap-3 rounded-lg border p-3" aria-labelledby="next-meeting-heading">
    <div class="flex items-start gap-2">
      <button type="button" class="grid min-w-0 flex-1 gap-0.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50" on:click={() => { if (meeting !== undefined) joinOrOpenMeeting(meeting, false) }}>
        <h2 id="next-meeting-heading" class="m-0 truncate text-sm font-semibold">{meeting.title}</h2>
        <span class="text-xs tabular-nums text-muted-foreground">{timeRange(meeting, lang)} · {timing}</span>
      </button>
      {#if isJoinable}
        <Button size="sm" onclick={() => { if (meeting !== undefined) joinOrOpenMeeting(meeting, true) }}><Video />{t('Join')}</Button>
      {/if}
    </div>
    {#if inCall.length > 0}
      <AvatarStack people={inCall} />
    {/if}

    <div class="grid gap-1">
      <h3 class="m-0 text-xs font-medium text-muted-foreground">{t('Agenda')}</h3>
      {#if agenda.lines.length === 0}
        <p class="m-0 text-muted-foreground">{t('NoAgenda')}</p>
      {:else}
        <ul class="m-0 grid list-none gap-0.5 p-0">
          {#each agenda.lines as line, index (index)}<li class="truncate">{line}</li>{/each}
        </ul>
        {#if agenda.hasMore}
          <Button variant="ghost" size="xs" class="justify-self-start px-0 text-muted-foreground" onclick={() => { if (meeting !== undefined) joinOrOpenMeeting(meeting, false) }}>{t('MoreAgenda')}</Button>
        {/if}
      {/if}
    </div>

    {#if declined.length > 0}
      <div class="grid gap-1">
        <h3 class="m-0 text-xs font-medium text-muted-foreground">{t('Declined')} <span class="tabular-nums">{declined.length}</span></h3>
        <ul class="m-0 flex list-none flex-wrap items-center gap-x-3 gap-y-1.5 p-0">
          {#each declined as person (person)}
            <li class="flex min-w-0 items-center gap-1.5"><PersonAvatar {person} /><span class="max-w-24 truncate">{firstNameOf(person)}</span></li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if openItems.length > 0}
      <div class="grid gap-1">
        <h3 class="m-0 text-xs font-medium text-muted-foreground">{t('OpenItems')} <span class="tabular-nums">{openItems.length}</span></h3>
        <ul class="m-0 grid list-none gap-0.5 p-0">
          {#each openItems as item (item._id)}
            <li>
              <button type="button" class="flex w-full min-w-0 items-baseline gap-2 rounded-md px-1 py-0.5 -mx-1 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50" on:click={() => { showPanel(tracker.component.EditIssue, item._id, tracker.class.Issue, 'content') }}>
                <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{item.identifier}</span>
                <span class="truncate">{item.title}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </section>
{/if}
