<script lang="ts">
  import { onDestroy } from 'svelte'
  import { CalendarPlus, CircleCheck, Pencil } from '@lucide/svelte'
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { AccountRole, getCurrentAccount, hasAccountRole, type Class, type Ref } from '@hcengineering/core'
  import hr, { type Department, type Staff } from '@hcengineering/hr'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Button, buttonVariants } from '../../../../lib/components/ui/button'
  import { Input } from '../../../../lib/components/ui/input'
  import { cn } from '../../../../lib/utils'
  import { Label } from '../../../../lib/components/ui/label'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import * as Popover from '../../../../lib/components/ui/popover'
  import {
    ANNUAL_LEAVE_DAYS_ATTR,
    MAX_ANNUAL_LEAVE_DAYS,
    annualAllowance,
    daysLeft,
    pendingDays,
    type Leave,
    type LeaveDay
  } from '../../../../lib/leave'
  import { balanceText, dayUnit, textOf } from '../strings'
  import type { Lang } from '../lib/types'
  import LeaveDialog from './LeaveDialog.svelte'

  export let lang: Lang
  export let anchor: number
  export let firstDayOfWeek: number

  interface HeadDepartment extends Department {
    [ANNUAL_LEAVE_DAYS_ATTR]?: number
  }
  const headClass = hr.class.Department as Ref<Class<HeadDepartment>>

  const client = getClient()
  const me = getCurrentEmployee()
  const isAdmin = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)
  const year = new Date().getFullYear()

  let leaves: Leave[] = []
  createQuery().query(hr.class.Request, { attachedTo: me as Ref<Staff> }, (found) => { leaves = found })
  let publicHolidays: Array<{ date: LeaveDay, title: string }> = []
  createQuery().query(hr.class.PublicHoliday, {}, (found) => { publicHolidays = found })
  $: holidays = publicHolidays.map((holiday) => holiday.date)
  let head: HeadDepartment | undefined
  createQuery().query(headClass, { _id: hr.ids.Head }, (found) => { head = found[0] })

  $: t = textOf(lang)
  $: allowance = annualAllowance(head?.[ANNUAL_LEAVE_DAYS_ATTR])
  $: left = daysLeft(allowance, leaves, year, holidays)
  $: pending = pendingDays(leaves, year, holidays)

  let isRequestOpen = false

  const SENT_NOTICE_MS = 10000
  let sentNotice = ''
  let sentTimer: ReturnType<typeof setTimeout> | undefined
  function showSent (notice: string): void {
    isRequestOpen = false
    sentNotice = notice
    clearTimeout(sentTimer)
    sentTimer = setTimeout(() => { sentNotice = '' }, SENT_NOTICE_MS)
  }
  function openRequest (): void {
    sentNotice = ''
    isRequestOpen = true
  }
  onDestroy(() => { clearTimeout(sentTimer) })

  let isAllowanceOpen = false
  let allowanceInput = ''
  let isAllowanceFailed = false
  $: parsedAllowance = Number(allowanceInput)
  $: isAllowanceValid = annualAllowance(parsedAllowance) === parsedAllowance
  function openAllowance (isOpen: boolean): void {
    isAllowanceOpen = isOpen
    if (isOpen) allowanceInput = String(allowance)
    isAllowanceFailed = false
  }
  async function saveAllowance (): Promise<void> {
    if (head === undefined || !isAllowanceValid) return
    isAllowanceFailed = false
    try {
      await client.update(head, { [ANNUAL_LEAVE_DAYS_ATTR]: parsedAllowance })
      isAllowanceOpen = false
    } catch (err) {
      isAllowanceFailed = true
      throw err
    }
  }
</script>

<section class="grid gap-2" aria-labelledby="lich-leave-heading">
  <div class="flex h-7 items-center justify-between gap-2 px-2">
    <h3 id="lich-leave-heading" class="m-0 text-xs font-medium text-muted-foreground">{t('AnnualLeave')} {year}</h3>
    {#if isAdmin && head !== undefined}
      <Popover.Root open={isAllowanceOpen} onOpenChange={openAllowance}>
        <Popover.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'text-muted-foreground')} aria-label={t('ChangeAllowance')} title={t('ChangeAllowance')}>
          <Pencil class="size-3.5" />
        </Popover.Trigger>
        <Popover.Content align="start" class="w-64">
          <form class="grid gap-3" on:submit|preventDefault={() => { void saveAllowance() }}>
            <div class="grid gap-1.5">
              <Label for="lich-leave-allowance">{t('CompanyAllowance')}</Label>
              <Input id="lich-leave-allowance" type="number" inputmode="numeric" min="1" max={MAX_ANNUAL_LEAVE_DAYS} step="1" bind:value={allowanceInput} aria-invalid={!isAllowanceValid} aria-describedby="lich-leave-allowance-hint" class="tabular-nums" />
              <p id="lich-leave-allowance-hint" class="m-0 text-xs text-muted-foreground">{isAllowanceValid ? t('CompanyAllowanceHint') : t('AllowanceRange')}</p>
            </div>
            {#if isAllowanceFailed}
              <p class="m-0 text-xs text-destructive" role="alert">{t('AllowanceSaveFailed')}</p>
            {/if}
            <div class="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onclick={() => { isAllowanceOpen = false }}>{t('Cancel')}</Button>
              <Button type="submit" size="sm" disabled={!isAllowanceValid}>{t('Save')}</Button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Root>
    {/if}
  </div>
  <p class="m-0 flex flex-wrap items-baseline gap-x-1.5 px-2 text-sm" role="status">
    <span class="font-semibold tabular-nums" class:text-destructive={left < 0}>
      {balanceText(t, left)}
    </span>
    <span class="text-xs text-muted-foreground tabular-nums">{t('AllowanceOf', { count: allowance })}</span>
  </p>
  {#if pending > 0}
    <p class="m-0 px-2 text-xs text-muted-foreground tabular-nums">{t('PendingDays', { count: pending, days: dayUnit(t, pending) })}</p>
  {/if}
  <Button variant="outline" class="w-full justify-start" data-coach="leave-request" onclick={openRequest}>
    <CalendarPlus />{t('RequestLeave')}
  </Button>
  <p class="m-0 flex items-center gap-1.5 px-2 text-sm font-medium" class:sr-only={sentNotice === ''} role="status">
    {#if sentNotice !== ''}
      <CircleCheck class="size-4 shrink-0 text-primary" aria-hidden="true" />{sentNotice}
    {/if}
  </p>
</section>

<Dialog.Root open={isRequestOpen} onOpenChange={(isOpen) => { isRequestOpen = isOpen }}>
  {#if isRequestOpen}
    <!-- Top-anchored: the over-allowance alert grows the form, and a centred dialog would jump. -->
    <Dialog.Content class="top-[12vh] max-h-[80vh] translate-y-0 gap-0 overflow-y-auto p-0 sm:max-w-md">
      <LeaveDialog {lang} {anchor} {firstDayOfWeek} {leaves} {publicHolidays} {allowance} on:close={() => { isRequestOpen = false }} on:sent={(e) => { showSent(e.detail) }} />
    </Dialog.Content>
  {/if}
</Dialog.Root>
