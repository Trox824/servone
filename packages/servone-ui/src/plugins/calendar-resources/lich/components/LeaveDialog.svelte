<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { TriangleAlert } from '@lucide/svelte'
  import contact, { formatName, getCurrentEmployee, type Employee } from '@hcengineering/contact'
  import { getAccountClient } from '@hcengineering/contact-resources'
  import core, { getCurrentAccount, type AccountUuid, type Markup, type Ref } from '@hcengineering/core'
  import hr, { timeToTzDate, type RequestType, type TzDate } from '@hcengineering/hr'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { EmptyMarkup, jsonToMarkup, nodeDoc, nodeParagraph, nodeText } from '@hcengineering/text'
  import { isLeaveOn, isTopOfChart, routeApproval, type StandIn } from '@servone/notify-rules'
  import { LEAVE_APPROVAL_ATTR } from '@servone/approvals/src/gate'
  import { Button } from '../../../../lib/components/ui/button'
  import { Label } from '../../../../lib/components/ui/label'
  import { Skeleton } from '../../../../lib/components/ui/skeleton'
  import { Textarea } from '../../../../lib/components/ui/textarea'
  import * as Alert from '../../../../lib/components/ui/alert'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import * as Select from '../../../../lib/components/ui/select'
  import {
    ANNUAL_LEAVE_TYPE,
    daysLeft,
    localDay,
    nextWorkingDay,
    pendingDays,
    workingDays,
    workingDaysInYear,
    type Leave,
    type LeaveDay
  } from '../../../../lib/leave'
  import { teamDirectory, withoutBots } from '../../../../lib/team-departments'
  import { ROUTE_REASON, routeTextOf } from '../../../request-resources/route-strings'
  import { balanceText, dayUnit, textOf, type StringKey } from '../strings'
  import { leaveAdmins } from '../lib/leave'
  import { startOfDay } from '../lib/time'
  import type { Lang } from '../lib/types'
  import DatePicker from './fields/DatePicker.svelte'
  import PersonAvatar from './PersonAvatar.svelte'

  export let lang: Lang
  export let anchor: number
  export let firstDayOfWeek: number
  export let leaves: Leave[]
  export let publicHolidays: Array<{ date: LeaveDay, title: string }>
  export let allowance: number

  const dispatch = createEventDispatcher<{ close: undefined, sent: string }>()
  const client = getClient()
  const me = getCurrentEmployee()
  const directory = teamDirectory()

  const TYPES: Array<{ id: Ref<RequestType>, label: StringKey, hint?: StringKey }> = [
    { id: hr.ids.Vacation, label: 'LeaveVacation' },
    { id: hr.ids.Sick, label: 'LeaveSick' },
    { id: hr.ids.PTO, label: 'LeavePTO', hint: 'LeavePTOHint' }
  ]

  const timeOf = (day: LeaveDay): number => new Date(day.year, day.month, day.day).getTime()

  $: holidays = publicHolidays.map((holiday) => holiday.date)

  let type = TYPES[0].id
  let from = timeOf(nextWorkingDay(localDay(Math.max(startOfDay(anchor), startOfDay(Date.now()))), publicHolidays.map((holiday) => holiday.date)))
  let to = from
  let reason = ''
  let isSending = false
  let isSendFailed = false

  let employees: Employee[] = []
  let isLoaded = false
  createQuery().query(contact.mixin.Employee, { active: true }, (found) => { employees = found; isLoaded = true })
  $: people = withoutBots(employees, $directory.bots)
  $: self = people.find((employee) => employee._id === me)
  $: department = (self === undefined ? undefined : client.getHierarchy().asIf(self, hr.mixin.Staff)?.department) ?? hr.ids.Head
  let approvedLeaves: Array<{ attachedTo: string, tzDate: TzDate, tzDueDate: TzDate }> = []
  createQuery().query(hr.class.Request, { [LEAVE_APPROVAL_ATTR]: 'approved' }, (found) => { approvedLeaves = found })
  const standInOf = (employee: Employee): Array<[string, StandIn]> => {
    const staff: { servoneStandIn?: string | null, servoneStandInFrom?: number | null, servoneStandInTo?: number | null } | undefined = Reflect.get(employee, hr.mixin.Staff)
    const person = staff?.servoneStandIn
    return person === undefined || person === null ? [] : [[employee._id, { person, from: staff?.servoneStandInFrom ?? undefined, to: staff?.servoneStandInTo ?? undefined }]]
  }
  const now = Date.now()
  $: route = routeApproval<string, string>({
    submitter: me,
    department,
    departments: $directory.departments,
    active: $directory.active,
    onLeave: new Set(approvedLeaves.filter((leave) => isLeaveOn(leave, now)).map((leave) => leave.attachedTo)),
    standIns: new Map(people.flatMap(standInOf)),
    admins: adminIds.flatMap((uuid) => people.filter((employee) => employee.personUuid === uuid).map((employee) => employee._id)),
    now
  })
  $: approver = people.find((employee) => employee._id === route?.approver)
  $: routeFor = route?.for
  $: routeName = route?.kind === 'no_head'
    ? $directory.departments.find((team) => team._id === routeFor)?.name ?? ''
    : (people.find((employee) => employee._id === routeFor)?.name ?? '')
  $: routeText = route?.kind === undefined
    ? ''
    : routeTextOf(lang)(ROUTE_REASON[route.kind], { name: route.kind === 'no_head' ? routeName : formatName(routeName), team: routeName })
  $: isSelfApproved = isTopOfChart(me, $directory.departments, $directory.active)
  $: hasApprover = approver !== undefined || isSelfApproved

  const MAX_ADMINS_NAMED = 2
  let adminIds: AccountUuid[] = []
  void getAccountClient().getWorkspaceMembers().then((members) => {
    adminIds = leaveAdmins(members, getCurrentAccount().uuid)
  })
  $: adminNames = adminIds
    .flatMap((uuid) => people.filter((employee) => employee.personUuid === uuid))
    .slice(0, MAX_ADMINS_NAMED)
    .map((employee) => formatName(employee.name))
  $: noApproverText = adminNames.length === 0
    ? t('NoApprover')
    : t('NoApproverAsk', { names: new Intl.ListFormat(lang, { type: 'disjunction' }).format(adminNames) })

  $: t = textOf(lang)
  $: fromDay = localDay(from)
  $: toDay = localDay(to)
  $: requested = workingDays(fromDay, toDay, holidays)
  $: isAnnual = type === ANNUAL_LEAVE_TYPE
  $: before = daysLeft(allowance, leaves, fromDay.year, holidays)
  $: pending = pendingDays(leaves, fromDay.year, holidays)
  $: after = before - workingDaysInYear(fromDay, toDay, fromDay.year, holidays)
  $: afterText = (count: number): string => {
    const days = dayUnit(t, count)
    if (count < 0) return t(isSelfApproved ? 'DaysOverAfterSelf' : 'DaysOverAfter', { count: -count, days })
    return t(isSelfApproved ? 'DaysLeftAfterSelf' : 'DaysLeftAfter', { count, days })
  }

  function setFrom (next: number): void {
    from = next
    if (to < from) to = from
  }

  function reasonMarkup (plain: string): Markup {
    const lines = plain.split('\n').map((line) => line.trim()).filter((line) => line !== '')
    if (lines.length === 0) return EmptyMarkup
    return jsonToMarkup(nodeDoc(...lines.map((line) => nodeParagraph(nodeText(line)))))
  }

  async function send (): Promise<void> {
    if (isSending || self === undefined || requested === 0 || !hasApprover) return
    isSending = true
    isSendFailed = false
    try {
      const staff = client.getHierarchy().as(self, hr.mixin.Staff)
      await client.addCollection(hr.class.Request, core.space.Workspace, staff._id, hr.mixin.Staff, 'requests', {
        type,
        tzDate: timeToTzDate(from),
        tzDueDate: timeToTzDate(to),
        description: reasonMarkup(reason),
        department
      })
      dispatch('sent', approver === undefined ? t('SentSelfApproved') : t('SentTo', { name: formatName(approver.name) }))
    } catch (err) {
      isSendFailed = true
      throw err
    } finally {
      isSending = false
    }
  }
</script>

<form class="flex flex-col" on:submit|preventDefault={() => { void send() }}>
  <div class="grid gap-5 px-6 pb-5 pt-6">
    <Dialog.Title class="pr-8 text-lg font-semibold">{t('RequestLeave')}</Dialog.Title>

    <div class="grid gap-1.5">
      <Label for="lich-leave-type">{t('LeaveType')}</Label>
      <Select.Root type="single" value={type} onValueChange={(picked) => { type = TYPES.find((option) => option.id === picked)?.id ?? type }}>
        <Select.Trigger id="lich-leave-type" class="w-full">{t(TYPES.find((option) => option.id === type)?.label ?? 'LeaveVacation')}</Select.Trigger>
        <Select.Content>
          {#each TYPES as option (option.id)}
            <Select.Item value={option.id} label={t(option.label)}>
              <span class="grid gap-0.5">
                {t(option.label)}
                {#if option.hint !== undefined}
                  <span class="text-xs text-muted-foreground">{t(option.hint)}</span>
                {/if}
              </span>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div class="grid min-w-0 gap-1.5">
        <Label for="lich-leave-from">{t('LeaveFrom')}</Label>
        <DatePicker id="lich-leave-from" value={from} {lang} {firstDayOfWeek} rangeEnd={to} holidays={publicHolidays} on:change={(e) => { setFrom(e.detail) }} />
      </div>
      <div class="grid min-w-0 gap-1.5">
        <Label for="lich-leave-to">{t('LeaveTo')}</Label>
        <DatePicker id="lich-leave-to" value={to} min={from} rangeStart={from} {lang} {firstDayOfWeek} holidays={publicHolidays} on:change={(e) => { to = e.detail }} />
      </div>
    </div>

    <div class="grid gap-1.5">
      <Label for="lich-leave-reason">{t('Reason')}</Label>
      <Textarea id="lich-leave-reason" bind:value={reason} rows={3} placeholder={t(isSelfApproved ? 'ReasonPlaceholderSelf' : 'ReasonPlaceholder')} class="resize-none" />
    </div>

    <dl class="m-0 grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5 border-t border-border pt-4 text-sm">
      <dt class="text-muted-foreground">{t('LeaveDays')}</dt>
      <dd class="m-0 font-medium tabular-nums" class:text-destructive={requested === 0}>
        {requested === 0 ? t('NoWorkingDays') : t('WorkingDays', { count: requested, days: dayUnit(t, requested) })}
      </dd>
      <dt class="text-muted-foreground">{t('AnnualLeave')}</dt>
      <!-- Two lines reserved so switching Type does not resize the dialog. -->
      <dd class="m-0 grid min-h-[calc(2lh+--spacing(0.5))] content-start gap-0.5 tabular-nums" aria-live="polite">
        {#if isAnnual}
          <span class="text-muted-foreground">
            {balanceText(t, before)}{#if pending > 0}{' · '}{t('PendingShort', { count: pending, days: dayUnit(t, pending) })}{/if}
          </span>
          <span class="font-medium" class:text-destructive={after < 0}>{afterText(after)}</span>
        {:else}
          <span class="text-muted-foreground">{t('NoAllowanceUse')}</span>
        {/if}
      </dd>
      <dt class="text-muted-foreground">{t('Approver')}</dt>
      <dd class="m-0 min-w-0">
        {#if !isLoaded}
          <Skeleton class="h-5 w-32" />
        {:else if isSelfApproved}
          <span class="text-muted-foreground">{t('SelfApproved')}</span>
        {:else if approver !== undefined}
          <span class="flex min-w-0 items-center gap-2">
            <PersonAvatar person={approver._id} />
            <span class="truncate font-medium">{formatName(approver.name)}</span>
          </span>
          {#if routeText !== ''}
            <span class="mt-0.5 block text-xs text-muted-foreground">({routeText})</span>
          {/if}
        {:else}
          <span class="text-destructive">{noApproverText}</span>
        {/if}
      </dd>
    </dl>

    {#if isAnnual && after < 0 && requested > 0}
      <Alert.Root variant="destructive">
        <TriangleAlert />
        <Alert.Description>{t(isSelfApproved ? 'OverWarningSelf' : 'OverWarning', { count: -after, days: dayUnit(t, after) })}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if isSendFailed}
      <p class="m-0 text-sm text-destructive" role="alert">{t('SendFailed')}</p>
    {/if}
  </div>

  <Dialog.Footer class="mx-0 mb-0 px-6">
    <Button type="button" variant="ghost" onclick={() => { dispatch('close') }}>{t('Cancel')}</Button>
    <Button data-track="calendar.leave.submit" type="submit" disabled={isSending || requested === 0 || self === undefined || !hasApprover}>{t(isSelfApproved ? 'BookLeave' : 'SendRequest')}</Button>
  </Dialog.Footer>
</form>
