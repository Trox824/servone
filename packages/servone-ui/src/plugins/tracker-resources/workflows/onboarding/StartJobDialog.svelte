<script lang="ts">
  import { formatName, getCurrentEmployee, getName, type Employee, type Person } from '@hcengineering/contact'
  import { employeeByIdStore } from '@hcengineering/contact-resources'
  import type { Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import tracker from '@hcengineering/tracker'
  import { deviceOptionsStore as deviceInfo, Label, themeStore } from '@hcengineering/ui'
  import { openDoc } from '@hcengineering/view-resources'
  import { resolveManager } from '@servone/notify-rules'
  import { Hourglass, TriangleAlert } from '@lucide/svelte'
  import { createEventDispatcher } from 'svelte'
  import { Button } from '../../../../lib/components/ui/button'
  import * as Dialog from '../../../../lib/components/ui/dialog'
  import { localDay } from '../../../../lib/leave'
  import { staffDepartmentOf } from '../../../../lib/profile-department'
  import { teamDirectory } from '../../../../lib/team-departments'
  import { headDepartment } from '../../../../lib/team-mentions'
  import DatePicker from '../../../calendar-resources/lich/components/fields/DatePicker.svelte'
  import PersonAvatar from '../../../calendar-resources/lich/components/PersonAvatar.svelte'
  import { dateShort } from '../../../calendar-resources/lich/lib/format'
  import { firstFreeDay, jobDraft, JOB_TEMPLATES, notifiedNow, type JobKind } from './onboarding'
  import { startJob, templatedProjectClass } from './start-job'
  import { en, str, vi } from './strings'

  export let person: Employee
  export let kind: JobKind

  const dispatch = createEventDispatcher<{ close: undefined }>()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const me = getCurrentEmployee()
  const directory = teamDirectory()

  const today = localDay(Date.now())
  const freeDay = firstFreeDay(kind, today)
  let day = new Date(freeDay.year, freeDay.month, freeDay.day).getTime()
  const startOfToday = new Date(today.year, today.month, today.day).getTime()
  export let isStarting = false
  let failure: string | undefined

  let workflowName: string | undefined
  const workflowQuery = createQuery()
  $: workflowQuery.query(templatedProjectClass, { servoneTemplate: JOB_TEMPLATES[kind].key, archived: false }, (found) => {
    workflowName = found[0]?.name
  }, { limit: 1 })

  $: language = $themeStore.language === 'en' ? 'en' : 'vi'
  $: personName = getName(hierarchy, person)
  $: reportsToId = resolveManager(person._id, staffDepartmentOf(hierarchy, person) ?? headDepartment, $directory.departments, $directory.active)
  $: reportsTo = reportsToId === undefined ? undefined : $employeeByIdStore.get(reportsToId as Ref<Employee>)
  $: job = jobDraft<Ref<Person>>({ kind, person: person._id, personName, manager: reportsTo?._id, admin: me, day: localDay(day), language })
  $: nameOf = (id: Ref<Person>): string | undefined => {
    if (id === me) return undefined
    const owner = $employeeByIdStore.get(id as Ref<Employee>)
    return owner === undefined ? '' : formatName(owner.name)
  }
  $: notifiedNames = notifiedNow(job).map((id) => nameOf(id) ?? (language === 'en' ? en : vi).YouInList).join(', ')
  $: heldSteps = job.steps.filter((step) => step.isHeld)

  async function start (): Promise<void> {
    isStarting = true
    failure = undefined
    try {
      const created = await startJob(client, kind, person._id, job, language)
      const issue = await client.findOne(tracker.class.Issue, { _id: created })
      dispatch('close')
      if (issue !== undefined) await openDoc(hierarchy, issue)
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    } finally {
      isStarting = false
    }
  }
</script>

<form class="flex flex-col" on:submit|preventDefault={() => { void start() }}>
  <div class="grid gap-5 px-6 pb-5 pt-6">
    <div class="grid gap-1 pr-8">
      <Dialog.Title class="text-lg font-semibold">
        <Label label={kind === 'onboarding' ? str.StartOnboarding : str.StartOffboarding} />
      </Dialog.Title>
      <Dialog.Description class="flex items-center gap-2 text-sm text-muted-foreground">
        <PersonAvatar person={person._id} />
        <span class="truncate">{personName}</span>
      </Dialog.Description>
    </div>

    <div class="grid gap-1.5">
      <label for="servone-job-day" class="text-sm font-medium">
        <Label label={kind === 'onboarding' ? str.StartDay : str.LastDay} />
      </label>
      <DatePicker id="servone-job-day" value={day} lang={language} firstDayOfWeek={$deviceInfo.firstDayOfWeek} on:change={(e) => { day = e.detail }} />
    </div>

    <section class="grid gap-2 border-t border-border pt-4" aria-labelledby="servone-job-steps">
      <div class="grid gap-0.5">
        <h3 id="servone-job-steps" class="m-0 text-sm font-medium">
          <Label label={str.StepsHeading} />
        </h3>
        <p class="m-0 text-xs text-muted-foreground"><Label label={str.StepsHint} /></p>
      </div>
      {#if reportsTo === undefined}
        <p class="m-0 flex gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <Label label={str.NoManager} />
        </p>
      {/if}
      <ol class="m-0 grid list-none gap-0 p-0 text-sm" aria-live="polite">
        {#each job.steps as step, index (index)}
          {@const ownerName = step.assignee === null ? undefined : nameOf(step.assignee)}
          <li class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 py-1.5">
            <span class="line-clamp-2">{step.title}</span>
            <span class="text-right tabular-nums {step.dueDate < startOfToday ? 'text-destructive' : 'text-muted-foreground'}">{dateShort(step.dueDate, language)}</span>
            <span class="col-span-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {#if step.assignee === null}
                <Hourglass class="size-3.5 shrink-0" aria-hidden="true" />
                <Label label={str.Held} />
              {:else if ownerName === undefined}
                <PersonAvatar person={step.assignee} />
                <Label label={str.You} />
              {:else}
                <PersonAvatar person={step.assignee} />
                <span class="truncate">{ownerName}</span>
              {/if}
            </span>
          </li>
        {/each}
      </ol>
      <div class="grid gap-1 text-xs text-muted-foreground">
        <p class="m-0"><Label label={str.NotifiedNow} params={{ names: notifiedNames }} /></p>
        {#each heldSteps as step (step.title)}
          <p class="m-0"><Label label={str.HeldStep} params={{ person: personName, step: step.title }} /></p>
        {/each}
      </div>
    </section>

    {#if failure !== undefined}
      <p class="m-0 text-sm text-destructive" role="alert"><Label label={str.StartFailed} params={{ reason: failure }} /></p>
    {/if}
  </div>

  <Dialog.Footer class="mx-0 mb-0 px-6">
    <Button type="button" variant="ghost" disabled={isStarting} onclick={() => { dispatch('close') }}><Label label={str.Cancel} /></Button>
    <Button type="submit" disabled={isStarting}>
      <Label label={isStarting ? str.Creating : str.CreateTasks} params={{ count: job.steps.length, workflow: workflowName ?? JOB_TEMPLATES[kind].name[language] }} />
    </Button>
  </Dialog.Footer>
</form>
