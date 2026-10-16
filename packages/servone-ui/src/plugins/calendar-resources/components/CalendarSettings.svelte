<script lang="ts">
  import {
    type Calendar,
    type ExternalCalendar,
    getPrimaryCalendar,
    type PrimaryCalendar,
    type Visibility
  } from '@hcengineering/calendar'
  import core, { getCurrentAccount, groupByArray, type Ref } from '@hcengineering/core'
  import { type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Breadcrumb, Header, Label, Scroller, Toggle } from '@hcengineering/ui'
  import { Skeleton } from '../../../lib/components/ui/skeleton'
  import calendar from '../plugin'
  import CalendarSelector from './CalendarSelector.svelte'
  import VisibilityEditor from './VisibilityEditor.svelte'

  const INTERNAL_GROUP = 'Servone'
  const NO_CALENDARS = 'calendar:string:ServoneNoCalendars' as IntlString

  const account = getCurrentAccount()
  const client = getClient()

  let calendars: Calendar[] = []
  let preference: PrimaryCalendar | undefined
  let hasCalendars = false
  let hasPreference = false
  let primaryId: Ref<Calendar> | undefined

  createQuery().query(calendar.class.Calendar, { user: { $in: account.socialIds } }, (docs) => {
    calendars = docs
    hasCalendars = true
  })
  createQuery().query(calendar.class.PrimaryCalendar, {}, (docs) => {
    preference = docs[0]
    hasPreference = true
  })

  $: if (hasCalendars && hasPreference) {
    primaryId = getPrimaryCalendar(calendars, preference, account.uuid)
  }

  $: groups = groupByArray(calendars, (item) => (item as ExternalCalendar).externalUser ?? INTERNAL_GROUP)

  function choosePrimary (event: CustomEvent<{ _id: Ref<Calendar> } | undefined>): void {
    const chosen = event.detail
    if (chosen === undefined) return
    if (preference !== undefined) {
      if (preference.attachedTo === chosen._id) return
      void client.update(preference, { attachedTo: chosen._id })
      return
    }
    void client.createDoc(calendar.class.PrimaryCalendar, core.space.Workspace, { attachedTo: chosen._id })
  }

  function setVisibility (target: Calendar, event: CustomEvent<Visibility | undefined>): void {
    if (event.detail === undefined) return
    void client.update(target, { visibility: event.detail })
  }

  function setHidden (target: Calendar, event: CustomEvent<boolean | undefined>): void {
    if (event.detail === undefined) return
    void client.update(target, { hidden: event.detail })
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={calendar.icon.Calendar} label={calendar.string.Calendar} size={'large'} isCurrent />
  </Header>
  <Scroller>
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-foreground"><Label label={calendar.string.PrimaryCalendar} /></h2>
        {#if hasCalendars && hasPreference}
          <CalendarSelector value={primaryId} withIcon={false} on:change={choosePrimary} />
        {:else}
          <Skeleton class="h-8 w-48" />
        {/if}
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-foreground"><Label label={calendar.string.Calendars} /></h2>
        {#if !hasCalendars}
          <Skeleton class="h-24 w-full" />
        {:else if calendars.length === 0}
          <div class="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">
            <Label label={NO_CALENDARS} />
          </div>
        {:else}
          <div class="w-full rounded-lg border border-border">
            <div class="calendar-row border-b border-border text-xs text-muted-foreground">
              <span><Label label={calendar.string.Calendar} /></span>
              <span><Label label={calendar.string.Visibility} /></span>
              <span class="text-right"><Label label={calendar.string.Hidden} /></span>
            </div>
            {#each groups as [groupName, members], index (groupName)}
              <div class={index > 0 ? 'border-t border-border' : ''}>
                <div class="px-3 pt-2 text-xs tracking-widest text-muted-foreground uppercase">{groupName}</div>
                {#each members as member (member._id)}
                  <div class="calendar-row">
                    <span class="truncate text-sm text-foreground">{member.name}</span>
                    <VisibilityEditor
                      value={member.visibility}
                      kind={'inline'}
                      size={'small'}
                      on:change={(event) => { setVisibility(member, event) }}
                    />
                    <span class="flex justify-end">
                      <Toggle
                        on={member.hidden}
                        disabled={member._class === calendar.class.Calendar}
                        on:change={(event) => { setHidden(member, event) }}
                      />
                    </span>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  </Scroller>
</div>

<style>
  .calendar-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 8rem 3rem;
    align-items: center;
    column-gap: 1rem;
    padding: 0.5rem 0.75rem;
  }
</style>
