<!-- Colleagues in a call right now, from love's live ParticipantInfo; the meeting name only when I am invited. -->
<script lang="ts">
  import type { Event } from '@hcengineering/calendar'
  import { getCurrentEmployee, getFirstName, type Person } from '@hcengineering/contact'
  import { getPersonByPersonRefStore } from '@hcengineering/contact-resources'
  import type { Ref } from '@hcengineering/core'
  import love, { type Room } from '@hcengineering/love'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Button } from '../../../../lib/components/ui/button'
  import type { Lang } from '../../../calendar-resources/lich/lib/types'
  import { joinOrOpenMeeting } from '../../../calendar-resources/lich/meeting'
  import AvatarStack from '../../../love-resources/calls/components/AvatarStack.svelte'
  import { MEETINGS_FLOOR } from '../../../love-resources/calls/context'
  import { infos, myInfo } from '../../../love-resources/calls/live'
  import { textOf } from './strings'
  import { liveCalls } from './today'

  export let events: Event[]
  export let lang: Lang

  const hierarchy = getClient().getHierarchy()
  const me = getCurrentEmployee()

  let callRooms = new Set<Ref<Room>>()
  createQuery().query(love.class.Room, { floor: MEETINGS_FLOOR }, (found) => { callRooms = new Set(found.map((room) => room._id)) })

  $: t = textOf(lang)
  $: calls = liveCalls($infos, callRooms, me)
  $: invitedTo = new Map(
    events.filter((e) => hierarchy.hasMixin(e, love.mixin.Meeting)).map((e) => [hierarchy.as(e, love.mixin.Meeting).room, e])
  )

  $: people = getPersonByPersonRefStore(calls.flatMap((call) => call.people))
  function namesOf (list: Array<Ref<Person>>): string {
    return list.map((person) => {
      const found = $people.get(person)
      return found === undefined ? '' : getFirstName(found.name)
    }).filter((name) => name !== '').join(', ')
  }
</script>

{#if calls.length > 0}
  <section class="grid gap-1.5" aria-labelledby="in-a-call-heading">
    <h3 id="in-a-call-heading" class="m-0 flex h-6 items-center px-2 text-xs font-medium text-muted-foreground">{t('InACall')}</h3>
    <ul class="m-0 grid list-none gap-1 p-0" aria-live="polite">
      {#each calls as call (call.room)}
        {@const meeting = invitedTo.get(call.room)}
        <li class="flex min-h-8 items-center gap-2 px-2 text-sm">
          <AvatarStack people={call.people} max={3} />
          <span class="grid min-w-0 flex-1">
            <span class="truncate">{namesOf(call.people)}</span>
            <span class="truncate text-xs text-muted-foreground">{meeting?.title ?? t('Call')}</span>
          </span>
          {#if meeting !== undefined && $myInfo?.room !== call.room}
            <Button size="xs" variant="outline" onclick={() => { joinOrOpenMeeting(meeting, true) }}>{t('Join')}</Button>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}
