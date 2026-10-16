<script lang="ts">
  import { Check, Pencil, UserRoundPlus } from '@lucide/svelte'
  import contact, { formatName, getCurrentEmployee, type Employee, type Person } from '@hcengineering/contact'
  import type { Mixin, Ref } from '@hcengineering/core'
  import hr, { type Staff } from '@hcengineering/hr'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Badge } from '../../../../lib/components/ui/badge'
  import { Button } from '../../../../lib/components/ui/button'
  import * as Command from '../../../../lib/components/ui/command'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import { Label } from '../../../../lib/components/ui/label'
  import { Switch } from '../../../../lib/components/ui/switch'
  import { isOffOn, localDay, type Leave } from '../../../../lib/leave'
  import { teamDirectory, withoutBots } from '../../../../lib/team-departments'
  import { routeTextOf } from '../../../request-resources/route-strings'
  import { dateShort } from '../lib/format'
  import { startOfDay } from '../lib/time'
  import type { Lang } from '../lib/types'
  import DatePicker from './fields/DatePicker.svelte'
  import PersonAvatar from './PersonAvatar.svelte'

  export let lang: Lang
  export let firstDayOfWeek: number

  interface StandInStaff extends Staff {
    servoneStandIn?: Ref<Person> | null
    servoneStandInFrom?: number | null
    servoneStandInTo?: number | null
  }
  const standInStaff: Ref<Mixin<StandInStaff>> = hr.mixin.Staff

  const client = getClient()
  const me = getCurrentEmployee()
  const directory = teamDirectory()
  const DAY_MS = 24 * 60 * 60 * 1000

  let employees: Employee[] = []
  createQuery().query(contact.mixin.Employee, { active: true }, (found) => { employees = found })
  let myLeaves: Leave[] = []
  createQuery().query(hr.class.Request, { attachedTo: me as Ref<Staff> }, (found) => { myLeaves = found })

  $: t = routeTextOf(lang)
  $: people = withoutBots(employees, $directory.bots)
  $: self = people.find((employee) => employee._id === me)
  $: staff = self === undefined ? undefined : client.getHierarchy().asIf(self, standInStaff)
  $: standIn = people.find((employee) => employee._id === staff?.servoneStandIn)
  $: from = staff?.servoneStandInFrom ?? undefined
  $: to = staff?.servoneStandInTo ?? undefined
  $: isHead = $directory.departments.some((department) => department.teamLead === me)
  const now = Date.now()
  $: isActive = standIn !== undefined && (
    myLeaves.some((leave) => isOffOn(leave, localDay(now))) ||
    (from !== undefined && to !== undefined && from <= now && now <= to)
  )
  $: summary = from !== undefined && to !== undefined
    ? t('StandInRange', { from: dateShort(from, lang), to: dateShort(to, lang) })
    : t('StandInWhenOnLeave')

  let isOpen = false
  let picked: Ref<Person> | undefined
  let hasDates = false
  let draftFrom = startOfDay(now)
  let draftTo = startOfDay(now)
  let isSaving = false
  let isSaveFailed = false

  function open (): void {
    picked = standIn?._id
    hasDates = from !== undefined && to !== undefined
    draftFrom = from === undefined ? startOfDay(now) : startOfDay(from)
    draftTo = to === undefined ? draftFrom : startOfDay(to)
    isSaveFailed = false
    isOpen = true
  }

  function setFrom (next: number): void {
    draftFrom = next
    if (draftTo < draftFrom) draftTo = draftFrom
  }

  async function write (fields: Pick<StandInStaff, 'servoneStandIn' | 'servoneStandInFrom' | 'servoneStandInTo'>): Promise<void> {
    if (self === undefined || isSaving) return
    isSaving = true
    isSaveFailed = false
    try {
      await client.updateMixin(self._id, self._class, self.space, standInStaff, fields)
      isOpen = false
    } catch (err) {
      isSaveFailed = true
      throw err
    } finally {
      isSaving = false
    }
  }

  const save = async (): Promise<void> => {
    await write({
      servoneStandIn: picked ?? null,
      servoneStandInFrom: hasDates ? draftFrom : null,
      servoneStandInTo: hasDates ? startOfDay(draftTo + DAY_MS) - 1 : null
    })
  }
  const remove = async (): Promise<void> => {
    await write({ servoneStandIn: null, servoneStandInFrom: null, servoneStandInTo: null })
  }
</script>

{#if self !== undefined && (isHead || standIn !== undefined)}
  <section class="grid gap-0.5" aria-label={t('StandInTitle')}>
    <!-- Rarely changed, so it stays quiet and leaves Request leave the rail's one button. -->
    {#if standIn === undefined}
      <Button variant="link" size="sm" class="h-6 justify-start px-2" onclick={open}>
        <UserRoundPlus />{t('StandInChoose')}
      </Button>
    {:else}
      <div class="flex items-center justify-between gap-2 px-2">
        <span class="flex min-w-0 items-center gap-2 text-sm">
          <PersonAvatar person={standIn._id} />
          <span class="truncate font-medium">{formatName(standIn.name)}</span>
          {#if isActive}
            <Badge variant="secondary" class="shrink-0 bg-primary/10 text-primary">{t('StandInActive')}</Badge>
          {/if}
        </span>
        <Button variant="ghost" size="icon-sm" class="shrink-0 text-muted-foreground" aria-label={t('StandInChange')} title={t('StandInChange')} onclick={open}>
          <Pencil class="size-3.5" />
        </Button>
      </div>
      <span class="px-2 text-xs text-muted-foreground tabular-nums">{t('StandInTitle')}, {summary}</span>
    {/if}
  </section>
{/if}

<Dialog.Root open={isOpen} onOpenChange={(next) => { isOpen = next }}>
  {#if isOpen}
    <Dialog.Content class="top-[12vh] max-h-[80vh] translate-y-0 gap-0 overflow-y-auto p-0 sm:max-w-md">
      <form class="flex flex-col" on:submit|preventDefault={() => { void save() }}>
        <div class="grid gap-5 px-6 pb-5 pt-6">
          <Dialog.Title class="pr-8 text-lg font-semibold">{t('StandInTitle')}</Dialog.Title>

          <div class="grid gap-1.5">
            <Label id="lich-standin-person">{t('StandInPerson')}</Label>
            <Command.Root class="rounded-md border border-border" aria-labelledby="lich-standin-person">
              <Command.Input placeholder={t('StandInPick')} aria-label={t('StandInPick')} />
              <Command.List class="max-h-52">
                <Command.Empty>{t('StandInNoMatch')}</Command.Empty>
                {#each people.filter((employee) => employee._id !== me) as employee (employee._id)}
                  {@const name = formatName(employee.name)}
                  <Command.Item value={employee._id} keywords={[name]} aria-checked={picked === employee._id} onSelect={() => { picked = employee._id }}>
                    <PersonAvatar person={employee._id} />
                    <span class="min-w-0 flex-1 truncate">{name}</span>
                    {#if picked === employee._id}<Check class="text-primary" aria-hidden="true" />{/if}
                  </Command.Item>
                {/each}
              </Command.List>
            </Command.Root>
          </div>

          <div class="grid gap-3">
            <div class="flex items-start justify-between gap-3">
              <div class="grid gap-0.5">
                <Label for="lich-standin-dates">{t('StandInDates')}</Label>
                <p class="m-0 text-xs text-muted-foreground">{t('StandInDatesHint')}</p>
              </div>
              <Switch id="lich-standin-dates" checked={hasDates} onCheckedChange={(next) => { hasDates = next }} />
            </div>
            {#if hasDates}
              <div class="grid grid-cols-2 gap-3">
                <div class="grid min-w-0 gap-1.5">
                  <Label for="lich-standin-from">{t('StandInFrom')}</Label>
                  <DatePicker id="lich-standin-from" value={draftFrom} {lang} {firstDayOfWeek} rangeEnd={draftTo} on:change={(e) => { setFrom(e.detail) }} />
                </div>
                <div class="grid min-w-0 gap-1.5">
                  <Label for="lich-standin-to">{t('StandInTo')}</Label>
                  <DatePicker id="lich-standin-to" value={draftTo} min={draftFrom} rangeStart={draftFrom} {lang} {firstDayOfWeek} on:change={(e) => { draftTo = e.detail }} />
                </div>
              </div>
            {/if}
          </div>

          {#if isSaveFailed}
            <p class="m-0 text-sm text-destructive" role="alert">{t('StandInSaveFailed')}</p>
          {/if}
        </div>

        <Dialog.Footer class="mx-0 mb-0 px-6">
          {#if standIn !== undefined}
            <Button type="button" variant="ghost" class="mr-auto text-destructive" disabled={isSaving} onclick={() => { void remove() }}>{t('StandInRemove')}</Button>
          {/if}
          <Button type="button" variant="ghost" onclick={() => { isOpen = false }}>{t('StandInCancel')}</Button>
          <Button data-track="calendar.stand_in.submit" type="submit" disabled={isSaving || picked === undefined}>{t('StandInSave')}</Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  {/if}
</Dialog.Root>
