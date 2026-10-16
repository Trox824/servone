<script lang="ts">
  import contact, { getFirstName, getLastName, type Employee } from '@hcengineering/contact'
  import hr from '@hcengineering/hr'
  import { createQuery } from '@hcengineering/presentation'
  import { localDay, type LeaveDay } from '../../../../lib/leave'
  import { teamDirectory, withoutBots } from '../../../../lib/team-departments'
  import { offOn } from '../../../hr-resources/org-chart/chart'
  import { textOf } from '../strings'
  import { dayHeading } from '../lib/format'
  import { shortNames, type Leave } from '../lib/leave'
  import type { Lang } from '../lib/types'
  import PersonAvatar from './PersonAvatar.svelte'

  export let lang: Lang

  const MAX_SHOWN = 3

  const directory = teamDirectory()

  let leaves: Leave[] | undefined
  createQuery().query(hr.class.Request, {}, (found) => { leaves = found })
  let employees: Employee[] | undefined
  createQuery().query(contact.mixin.Employee, { active: true }, (found) => { employees = found })

  const today = localDay(Date.now())

  $: t = textOf(lang)
  $: people = new Map<string, Employee>(withoutBots(employees ?? [], $directory.bots).map((employee) => [employee._id, employee]))
  $: off = leaves === undefined ? new Map<string, LeaveDay>() : offOn(leaves, today, new Set(people.keys()))
  $: absent = [...off.entries()].flatMap(([id, until]) => {
    const person = people.get(id)
    return person === undefined ? [] : [{ person, until }]
  })
  $: labels = shortNames(absent.map(({ person }) => ({ first: getFirstName(person.name), last: getLastName(person.name) })))
  $: away = absent.map(({ person, until }, index) => ({
    person,
    label: labels[index],
    untilText: t('OffUntil', { date: dayHeading(new Date(until.year, until.month, until.day).getTime(), lang) })
  })).sort((a, b) => a.label.localeCompare(b.label, 'vi'))
  let isExpanded = false
  $: shown = isExpanded ? away : away.slice(0, MAX_SHOWN)
  $: hiddenCount = away.length - MAX_SHOWN
</script>

{#if leaves !== undefined && employees !== undefined && away.length > 0}
  <section class="grid gap-1.5" aria-labelledby="lich-off-heading">
    <h3 id="lich-off-heading" class="m-0 flex h-6 items-center px-2 text-xs font-medium text-muted-foreground">{t('OffToday')}</h3>
    <ul class="m-0 flex list-none flex-wrap items-center gap-x-3 gap-y-1.5 p-0 px-2 text-sm">
      {#each shown as entry (entry.person._id)}
        <!-- Focusable so keyboard users can see the until-date that mouse users get from the tooltip. -->
        <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
        <li class="group flex min-w-0 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" title={entry.untilText} tabindex="0">
          <PersonAvatar person={entry.person._id} />
          <span class="max-w-24 truncate">{entry.label}</span>
          <span class="sr-only text-xs text-muted-foreground group-focus-visible:not-sr-only">{entry.untilText}</span>
        </li>
      {/each}
      {#if hiddenCount > 0}
        <li>
          <button type="button" class="rounded-sm text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" aria-expanded={isExpanded} on:click={() => { isExpanded = !isExpanded }}>
            {isExpanded ? t('ShowLess') : t('MoreOff', { count: hiddenCount })}
          </button>
        </li>
      {/if}
    </ul>
  </section>
{/if}
